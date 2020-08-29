local _, ns = ...

local log = {}

local function createHandler(name, alwaysPrint)
    return function(...)
        local warnings = log[name]
        local stack = debugstack(2)
        if alwaysPrint or not warnings then
            print("[Deprecated]", name, "=>", ...)
            print(stack)
        end
        if not warnings then
            warnings = {}
            log[name] = warnings
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
        hooksecurefunc(gmetatable, "__index", createHandler(name))
    end
end
