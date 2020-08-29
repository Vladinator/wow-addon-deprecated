const config = require('./config.json');
const util = require('util');
const fetch = require('node-fetch');
const exec = require('child_process').exec;
const path = require('path');
const fs = require('fs');

class Utils {
    static async Fetch(url) {
        const response = await fetch(url);
        if (!response.ok) return;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.indexOf('json') > -1) {
            try {
                const json = await response.json();
                if (json) return json;
            } catch (e) {
                console.error(e);
            }
        }
        try {
            const text = await response.text();
            if (text) return text;
        } catch (e) {
        }
    }
    static async Resolve(queue) {
        const rawresults = [];
        queue.push(async() => false);
        await queue.reduce((promise, func) => promise.then(file => rawresults.push(file) && func()), Promise.resolve());
        queue.splice(0, queue.length);
        const results = rawresults.filter(result => result);
        queue.push(...results);
        return results;
    }
    static async TempFile(data) {
        const tempfile = path.join(__dirname, 'tmp' + Math.floor(Math.random() * 1000000));
        return new Promise(resolve => {
            fs.writeFile(tempfile, data, 'utf8', (err, result) => {
                resolve({ filepath: tempfile, unlink: () => fs.unlink(tempfile, (err) => err && console.error(err)) });
            });
        });
    }
    static async Exec(command) {
        return new Promise(resolve => exec(command, (err, stdout, stderr) => resolve(stdout || stderr)));
    }
}

class WowTools {
    constructor() {
        this._filesUrl = 'https://wow.tools/files/scripts/api.php?length=25&search[regex]=true&search[value]=type:lua,deprecated_%';
        this._fileUrl = 'https://wow.tools/casc/file/chash?filedataid=%d&contenthash=%s&buildconfig=%s&cdnconfig=%s';
    }
    async getFiles() {
        const files = await Utils.Fetch(this._filesUrl);
        if (!files || !files.data) return;
        return files.data.map(file => {
            return {
                filedataid: file[0],
                filename: file[1] && file[1].split('/').splice(-1)[0],
                versions: file[3]
            };
        }).filter(file => {
            if (typeof file.filename !== 'string') return;
            if (!Array.isArray(file.versions)) return;
            const patchversion = file.filename.match(/_(\d+)_(\d+)_(\d+)\.lua$/i);
            if (!patchversion) return;
            file.patch = `${patchversion[1]}.${patchversion[2]}.${patchversion[3]}`;
            file.versions = file.versions.filter(version => {
                if (typeof version.description !== 'string') return;
                const versionbuild = version.description.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)/i);
                if (!versionbuild) return;
                version.patch = `${versionbuild[1]}.${versionbuild[2]}.${versionbuild[3]}`;
                version.build = versionbuild[4];
                version.patchbuild = `${version.patch}.${version.build}`;
                return version.patch >= file.patch;
            });
            file.versions.sort((a, b) => {
                return b.description.localeCompare(a.description);
            });
            return file.versions.length;
        });
    }
    async getFile(filedataid, contenthash, buildconfig, cdnconfig) {
        const url = util.format(this._fileUrl, filedataid, contenthash, buildconfig, cdnconfig);
        return await Utils.Fetch(url);
    }
}

class Lua {
    static async GetGlobals(files) {
        const globals = [];
        const queue = [];
        files.forEach(file => {
            queue.push(async () => {
                const tempfile = await Utils.TempFile(file);
                const output = await Utils.Exec(`"${config.findglobals}" "${tempfile.filepath}"`);
                tempfile.unlink();
                return output;
            });
        });
        const results = await Utils.Resolve(queue);
        results.forEach(result => {
            const fileGlobals = Lua.ParseFindGlobalsOutput(result);
            fileGlobals.forEach(name => globals.indexOf(name) === -1 && globals.push(name));
        });
        return globals;
    }
    static ParseFindGlobalsOutput(result) {
        const globals = [];
        const lines = result.split(/\r\n|\r|\n/g);
        lines.forEach(line => {
            const columns = line.split(/\t/g);
            if (columns[2] !== 'SETGLOBAL') return;
            const name = columns[4].match(/;\s*(.+)$/i)[1];
            globals.indexOf(name) === -1 && globals.push(name);
        });
        return globals;
    }
}

(async () => {
    const wt = new WowTools();
    // get the current deprecated lua files
    const files = await wt.getFiles();
    // queue all the files for download
    const queue = [];
    files.forEach(file => {
        const latestVersion = file.versions[0];
        queue.push(async () => await wt.getFile(file.filedataid, latestVersion.contenthash, latestVersion.buildconfig, latestVersion.cdnconfig));
    });
    // process download queue
    const luafiles = await Utils.Resolve(queue);
    // process lua files through the globals checker (make sure you update config.json with the path to your find globals script)
    const globals = await Lua.GetGlobals(luafiles);
    // output the globals into globals.lua for use with addon
    const luafile = path.join(__dirname, 'globals.lua');
    let luaglobals = JSON.stringify(globals);
    luaglobals = `local _, ns = ...\r\nns.GLOBALS = {${luaglobals.substr(1, luaglobals.length - 2)}}\r\n`;
    fs.writeFile(luafile, luaglobals, 'utf8', err => err ? console.error(err) : console.log('Done!'));
})();
