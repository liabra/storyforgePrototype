"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockContribution = exports.flagContribution = exports.updateContribution = exports.deleteContribution = exports.createContribution = exports.getContributionsByScene = void 0;
const client_1 = __importDefault(require("../prisma/client"));
const characterSelect = {
    select: { id: true, name: true, nickname: true, avatarUrl: true },
};
const userSelect = {
    select: { id: true, email: true, displayName: true, color: true },
};
const contribInclude = {
    character: characterSelect,
    user: userSelect,
};
const getContributionsByScene = (sceneId) => client_1.default.contribution.findMany({
    where: { sceneId, modStatus: { not: "BLOCKED" } },
    orderBy: { createdAt: "asc" },
    include: contribInclude,
});
exports.getContributionsByScene = getContributionsByScene;
const createContribution = (sceneId, data) => client_1.default.contribution.create({
    data: { ...data, sceneId },
    include: contribInclude,
});
exports.createContribution = createContribution;
const deleteContribution = (id) => client_1.default.contribution.delete({ where: { id } });
exports.deleteContribution = deleteContribution;
const updateContribution = (id, content) => client_1.default.contribution.update({
    where: { id },
    data: { content },
    include: contribInclude,
});
exports.updateContribution = updateContribution;
const flagContribution = (id) => client_1.default.contribution.update({ where: { id }, data: { modStatus: "FLAGGED" } });
exports.flagContribution = flagContribution;
const blockContribution = (id) => client_1.default.contribution.update({ where: { id }, data: { modStatus: "BLOCKED" } });
exports.blockContribution = blockContribution;
