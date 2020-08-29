local _, ns = ...

Deprecated_AlwaysPrint = false
Deprecated_LogTable = {}

local function createHandler(name)
    return function(...)
        local warnings = Deprecated_LogTable[name]
        local stack = debugstack(2)
        stack = {strsplit("\r\n", stack)}
        if Deprecated_AlwaysPrint or not warnings then
            print("[Deprecated]", name, "=>", ...)
            for _, line in ipairs(stack) do
                print(line)
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
