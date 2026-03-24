"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initIO = initIO;
exports.getIO = getIO;
let _io = null;
function initIO(io) {
    _io = io;
}
function getIO() {
    return _io;
}
