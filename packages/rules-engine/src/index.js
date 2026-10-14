"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileRules = compileRules;
exports.evaluateRules = evaluateRules;
const parser_js_1 = require("./parser.js");
const evaluator_js_1 = require("./evaluator.js");
__exportStar(require("./ast.js"), exports);
__exportStar(require("./parser.js"), exports);
__exportStar(require("./evaluator.js"), exports);
function compileRules(source) {
    const parser = new parser_js_1.RulesParser(source);
    return parser.parse();
}
function evaluateRules(ast, path, context) {
    const evaluator = new evaluator_js_1.RulesEvaluator(ast);
    return evaluator.evaluate(path, context);
}
//# sourceMappingURL=index.js.map