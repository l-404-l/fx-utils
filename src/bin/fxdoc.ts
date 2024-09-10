import ts from "typescript";
import { promises as fs } from "fs";
import { getFiles } from "../getFiles.js";
import { readJson } from "../readJson.js";

const options = {
  dir: "./src",
  out: "./fxdoc",
  tsconfig: "./tsconfig.json",
};

process.argv.forEach((arg, index) => {
  if (index > 1) {
    const [name, value] = arg.split("=", 2) as [keyof typeof options, string];

    if (name in options && value) options[name] = value.trim();
  }
});

console.log("running fxdoc");
console.log(JSON.stringify(options));

interface Export {
  name: string;
  description: string;
  parameters?: ts.Symbol[];
  returnType: string;
}

/** @type {Export[]} */
const exports: Export[] = [];

const tsconfig = await readJson(options.tsconfig);
const programFiles = await getFiles(options.dir);
const program = ts.createProgram(programFiles, tsconfig);
const typeChecker = program.getTypeChecker();

/**
 * Retrieves the function signature from a symbol.
 * @param symbol - The TypeScript symbol representing the function.
 * @returns The function signature or undefined.
 */
function getFunctionDeclarationFromSymbol(symbol: ts.Symbol): ts.Signature | undefined {
  const functionDeclaration = symbol.getDeclarations()?.[0];

  if (functionDeclaration && ts.isFunctionLike(functionDeclaration)) {
    return typeChecker.getSignatureFromDeclaration(functionDeclaration);
  }
}

/**
 * Retrieves the function signature from an expression.
 * @param functionArg - The TypeScript expression representing the function argument.
 * @returns The function signature or undefined.
 */
function getFunctionSignature(functionArg: ts.Expression): ts.Signature | undefined {
  if (ts.isFunctionLike(functionArg)) return typeChecker.getSignatureFromDeclaration(functionArg);

  if (ts.isIdentifier(functionArg)) {
    const symbol = typeChecker.getSymbolAtLocation(functionArg);

    if (!symbol) return;

    return (
      getFunctionDeclarationFromSymbol(symbol) || getFunctionDeclarationFromSymbol(typeChecker.getAliasedSymbol(symbol))
    );
  }
}

/**
 * Visits each node in the TypeScript AST to find export functions.
 * @param node - The TypeScript node to visit.
 */
function visit(node: ts.Node): void {
  if (ts.isCallExpression(node)) {
    const { expression, arguments: args } = node;

    if (ts.isIdentifier(expression) && expression.text === "exports" && ts.isStringLiteral(args[0])) {
      const name = args[0].text;
      const functionArg = args[1];
      const signature = getFunctionSignature(functionArg);

      if (signature) {
        const declaration = signature.getDeclaration();
        const parameters = signature.getParameters();
        const returnType = typeChecker.typeToString(typeChecker.getReturnTypeOfSignature(signature));
        const jsdoc = ts.getJSDocCommentsAndTags(declaration);
        const description = jsdoc.map((comment) => comment.comment).join("\n");

        exports.push({ name, description, parameters, returnType });
      }
    }
  }

  ts.forEachChild(node, visit);
}

program.getSourceFiles().forEach((sourceFile) => {
  if (sourceFile.isDeclarationFile) return;

  ts.forEachChild(sourceFile, visit);
});

const pkg = await readJson("package.json");

if (exports.length > 0) {
  const path = options.out;
  let dts: string[] = [];
  let dlua: string[] = [];

  await fs.mkdir(path, { recursive: true });

  exports.forEach((exp) => {
    const parameters = exp.parameters?.map((param) => param.valueDeclaration?.getText()).join(", ") || "";
    const output = `## ${exp.name}
${exp.description}

\`\`\`ts
${exp.name}(${parameters}) => ${exp.returnType}
\`\`\`

### Parameters

${
  exp.parameters
    ?.map((param) => {
      const [name, type] = param.valueDeclaration?.getText().split(": ", 2) || [];
      const comment = param.getDocumentationComment(typeChecker)[0]?.text;
      const str = `- ${name}: \`${type}\``;

      return comment ? `${str}\n  - ${comment}` : str;
    })
    .join("\n") || ""
}

### Returns
- ${exp.returnType}
`;

    dts.push(
      `${exp.description ? `/** ${exp.description} */\n\t\t` : ""}${exp.name}: (${parameters}) => ${exp.returnType};`
    );

    dlua.push(`---@field ${exp.name} fun(self: self, ${parameters}): ${exp.returnType} ${exp.description}`);

    fs.writeFile(`${path}/${exp.name}.md`, output);
  });

  fs.writeFile(
    `${path}/exports.d.ts`,
    `interface CitizenExports {\n\t"${pkg.name}": {\n\t\t${dts.join("\n\t\t")}\n\t}\n}`
  );

  fs.writeFile(`${path}/exports.d.lua`, `---@class CitizenExports.${pkg.name}\n${dlua.join("\n")}\n`);
}
