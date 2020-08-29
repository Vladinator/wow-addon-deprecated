local _, ns = ...
if WOW_PROJECT_ID ~= WOW_PROJECT_MAINLINE then ns.GLOBALS = nil return end

Deprecated_AlwaysPrint = true
Deprecated_LogTable = {}

local IGNORE_PATTERNS = {
    FRAMEXML = "^%[string \"@Interface\\FrameXML\\",
    BLIZZ_DEPRECATED = "^%[string \"@Interface\\AddOns\\Blizzard_Deprecated\\",
}

local function createHandler(name)
    return function(...)
        local warnings = Deprecated_LogTable[name]
        local stack = debugstack(2)
        stack = {strsplit("\r\n", stack)}
        if strfind(stack[2], IGNORE_PATTERNS.FRAMEXML) or strfind(stack[2], IGNORE_PATTERNS.BLIZZ_DEPRECATED) then
            return
        end
        if Deprecated_AlwaysPrint or not warnings then
            print("|cffFF5555[Deprecated]|cffFFFF00", name, "|cffFFFFFF=>", ...)
            for _, line in ipairs(stack) do
                print("|cffFF9999", line)
            end
        end
        if not warnings then
            warnings = {}
            Deprecated_LogTable[name] = warnings
        end
        warnings[#warnings + 1] = stack
    end
end

local gmetatable = getmetatable(_G)

for _, name in ipairs(ns.GLOBALS) do
    local value = _G[name]

    if type(value) == "function" then
        hooksecurefunc(name, createHandler(name))
    elseif value ~= nil then
        -- hooksecurefunc(gmetatable, "__index", createHandler(name)) -- TODO: there is no __index but we would like to detect when a global is read if possible
    end
end
