"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RulesEvaluator = void 0;
class RulesEvaluator {
    ast;
    constructor(ast) {
        this.ast = ast;
    }
    evaluate(path, context) {
        const normalizedPath = this.normalizePath(path);
        const method = context.request.method;
        try {
            const matchResult = this.evaluateMatches(this.ast.matches, normalizedPath, context, '');
            if (matchResult.allowed) {
                return {
                    allowed: true,
                    matchedRule: matchResult.matchedRule,
                    evaluatedAt: new Date().toISOString(),
                };
            }
            return {
                allowed: false,
                reason: matchResult.reason || 'No rule permitted this operation',
                evaluatedAt: new Date().toISOString(),
            };
        }
        catch (err) {
            // Fail closed on evaluation error
            return {
                allowed: false,
                reason: `Rule evaluation failed: ${err.message}`,
                evaluatedAt: new Date().toISOString(),
            };
        }
    }
    normalizePath(p) {
        const trimmed = p.replace(/^\/+|\/+$/g, '');
        return trimmed ? `/${trimmed}` : '/';
    }
    evaluateMatches(matches, targetPath, context, parentPathPattern) {
        for (const match of matches) {
            const fullPattern = this.normalizePath(`${parentPathPattern}/${match.pathPattern}`);
            const capturedParams = {};
            const isPathMatch = this.matchPattern(fullPattern, targetPath, capturedParams);
            if (isPathMatch) {
                // Merge captured params
                const mergedContext = {
                    ...context,
                    params: { ...context.params, ...capturedParams },
                };
                // Check allow statements in current match
                for (const allow of match.allowStatements) {
                    if (this.operationMatches(allow.operations, context.request.method)) {
                        const conditionAllowed = this.evaluateExpression(allow.condition, mergedContext);
                        if (conditionAllowed) {
                            return {
                                allowed: true,
                                matchedRule: `match ${fullPattern} { allow ${allow.operations.join(', ')} }`,
                            };
                        }
                    }
                }
                // Recurse into nested matches
                if (match.nestedMatches.length > 0) {
                    const nestedResult = this.evaluateMatches(match.nestedMatches, targetPath, mergedContext, fullPattern);
                    if (nestedResult.allowed) {
                        return nestedResult;
                    }
                }
            }
            else if (match.nestedMatches.length > 0) {
                // Check if pattern is a prefix of targetPath to continue recursion
                const prefixMatches = this.matchPrefix(fullPattern, targetPath, capturedParams);
                if (prefixMatches) {
                    const mergedContext = {
                        ...context,
                        params: { ...context.params, ...capturedParams },
                    };
                    const nestedResult = this.evaluateMatches(match.nestedMatches, targetPath, mergedContext, fullPattern);
                    if (nestedResult.allowed) {
                        return nestedResult;
                    }
                }
            }
        }
        return { allowed: false };
    }
    matchPattern(pattern, target, params) {
        const pSegs = pattern.split('/').filter(Boolean);
        const tSegs = target.split('/').filter(Boolean);
        // If recursive wildcard {document=**} is present at the end
        const lastSeg = pSegs[pSegs.length - 1];
        if (lastSeg && lastSeg.includes('=**}')) {
            const paramName = lastSeg.slice(1, lastSeg.indexOf('='));
            const prefixCount = pSegs.length - 1;
            if (tSegs.length < prefixCount)
                return false;
            for (let i = 0; i < prefixCount; i++) {
                if (!this.matchSegment(pSegs[i], tSegs[i], params))
                    return false;
            }
            params[paramName] = tSegs.slice(prefixCount).join('/');
            return true;
        }
        if (pSegs.length !== tSegs.length)
            return false;
        for (let i = 0; i < pSegs.length; i++) {
            if (!this.matchSegment(pSegs[i], tSegs[i], params))
                return false;
        }
        return true;
    }
    matchPrefix(pattern, target, params) {
        const pSegs = pattern.split('/').filter(Boolean);
        const tSegs = target.split('/').filter(Boolean);
        if (pSegs.length > tSegs.length)
            return false;
        for (let i = 0; i < pSegs.length; i++) {
            if (!this.matchSegment(pSegs[i], tSegs[i], params))
                return false;
        }
        return true;
    }
    matchSegment(pSeg, tSeg, params) {
        if (pSeg.startsWith('{') && pSeg.endsWith('}')) {
            const paramName = pSeg.slice(1, -1);
            params[paramName] = tSeg;
            return true;
        }
        return pSeg === tSeg;
    }
    operationMatches(allowedOps, method) {
        if (allowedOps.includes('read') && (method === 'get' || method === 'list'))
            return true;
        if (allowedOps.includes('write') && (method === 'create' || method === 'update' || method === 'delete'))
            return true;
        return allowedOps.includes(method);
    }
    evaluateExpression(expr, ctx) {
        const val = this.resolveValue(expr, ctx);
        return Boolean(val);
    }
    resolveValue(expr, ctx) {
        switch (expr.type) {
            case 'Literal':
                return expr.value;
            case 'Identifier':
                if (expr.name === 'request')
                    return ctx.request;
                if (expr.name === 'resource')
                    return ctx.resource;
                if (expr.name in ctx.params)
                    return ctx.params[expr.name];
                return undefined;
            case 'MemberAccess': {
                const obj = this.resolveValue(expr.object, ctx);
                if (obj === null || obj === undefined || typeof obj !== 'object') {
                    return undefined;
                }
                return obj[expr.property];
            }
            case 'UnaryExpression': {
                if (expr.operator === '!') {
                    return !this.resolveValue(expr.argument, ctx);
                }
                return undefined;
            }
            case 'BinaryExpression': {
                const left = this.resolveValue(expr.left, ctx);
                const right = this.resolveValue(expr.right, ctx);
                switch (expr.operator) {
                    case '&&':
                        return Boolean(left) && Boolean(right);
                    case '||':
                        return Boolean(left) || Boolean(right);
                    case '==':
                        return left === right;
                    case '!=':
                        return left !== right;
                    case '<':
                        return left < right;
                    case '<=':
                        return left <= right;
                    case '>':
                        return left > right;
                    case '>=':
                        return left >= right;
                }
            }
        }
    }
}
exports.RulesEvaluator = RulesEvaluator;
//# sourceMappingURL=evaluator.js.map