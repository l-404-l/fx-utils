//@ts-check
import ts from "typescript";
import { promises as fs } from "fs";

const options = process.argv.reduce(
  (acc, arg, index) => {
    if (index > 1) {
      const [name, value] = arg.split("=", 2);

      if (value) acc[name] = value.trim();
    }

    return acc;
  },
  {
    dir: "./src",
    out: "./fxdoc",
    tsconfig: "./tsconfig.json",
  }
);

console.log("running fxdoc");
console.log(JSON.stringify(options));

/**
 * @param args {string[]}
 */
export async function getFiles(...args) {
  const files = await Promise.all(
    args.map(async (dir) => {
      try {
        const dirents = await fs.readdir(`${dir}/`, { withFileTypes: true });
        const paths = await Promise.all(
          dirents.map(async (dirent) => {
            const path = `${dir}/${dirent.name}`;
            return dirent.isDirectory() ? await getFiles(path) : path;
          })
        );

        return paths.flat();
      } catch (err) {
        return [];
      }
    })
  );

  return files.flat();
}

/**
 * @typedef {Object} Export
 * @property {string} name
 * @property {string} description
 * @property {ts.Symbol[]|undefined} parameters
 * @property {string} returnType
 */

/** @type {Export[]} */
const exports = [];

const tsconfig = JSON.parse(await fs.readFile(options.tsconfig, "utf8"));
const programFiles = await getFiles(options.dir);
const program = ts.createProgram(programFiles, tsconfig);
const typeChecker = program.getTypeChecker();

/**
 * @param {ts.Expression} functionArg
 */
function getFunctionSignature(functionArg) {
  if (ts.isFunctionLike(functionArg))
    return typeChecker.getSignatureFromDeclaration(functionArg);

  if (ts.isIdentifier(functionArg)) {
    const functionName = functionArg.text;
    const sourceFile = functionArg.getSourceFile();

    return ts.forEachChild(sourceFile, (node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
        const signature = typeChecker.getSignatureFromDeclaration(node);

        if (signature) return signature;
      }
    });
  }
}

/**
 * @param {ts.Signature} signature
 */
function getCommentFromSignature(signature) {
  const declaration = signature.getDeclaration();

  if (declaration) {
    const sourceFile = declaration.getSourceFile();
    const comments = ts.getLeadingCommentRanges(
      sourceFile.getFullText(),
      declaration.pos
    );

    return comments
      ? comments
          .map((commentRange) =>
            sourceFile
              .getFullText()
              .slice(commentRange.pos + 3, commentRange.end - 3)
          )
          .join("\n")
          .replace(/^\s*\*\s*/gm, "") // Remove leading '*'
          .replace(/^\s*@\w+.*$/gm, "")
          .trim()
      : "";
  }

  return "";
}

/**
 * @param {ts.Node} node
 */
function visit(node) {
  if (ts.isCallExpression(node)) {
    const { expression, arguments: args } = node;

    if (
      ts.isIdentifier(expression) &&
      expression.text === "exports" &&
      ts.isStringLiteral(args[0])
    ) {
      const name = args[0].text;
      const functionArg = args[1];
      const signature = getFunctionSignature(functionArg);

      if (signature) {
        const parameters = signature.getParameters();
        const returnType = typeChecker.typeToString(
          typeChecker.getReturnTypeOfSignature(signature)
        );
        const description = getCommentFromSignature(signature);

        exports.push({ name, description, parameters, returnType });
      }
    }
  }

  ts.forEachChild(node, visit);
}

program.getSourceFiles().forEach((sourceFile) => {
  if (sourceFile.isDeclarationFile) return;

  visit(sourceFile);
});

const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));

if (exports.length > 0) {
  const path = options.out;
  await fs.mkdir(path, { recursive: true });

  exports.forEach((exp) => {
    const parameters =
      exp.parameters
        ?.map((param) => param.valueDeclaration?.getText())
        .join(", ") || "";
    const output = `## ${exp.name}
  ${exp.description}
  
  \`\`\`ts
  ${exp.name}(${parameters}) => ${exp.returnType}
  \`\`\`
  
  ### Parameters
  
  ${
    exp.parameters
      ?.map((param) => {
        const [name, type] =
          param.valueDeclaration?.getText().split(": ", 2) || [];
        const comment = param.getDocumentationComment(typeChecker)[0]?.text;
        const str = `- ${name}: \`${type}\``;

        return comment ? `${str}\n  - ${comment}` : str;
      })
      .join("\n") || ""
  }
  
  ### Returns
  - ${exp.returnType}
  
  ### Types
  
  \`\`\`ts
  interface CitizenExports {
    "${pkg.name}": {
      /** ${exp.description} */
      ${exp.name}: (${parameters}) => ${exp.returnType}
    }
  }
  \`\`\`
  
  \`\`\`lua
  ---@class CitizenExports.${pkg.name}
  ---@field ${exp.name} fun(self: self, ${parameters}): ${exp.returnType} ${
      exp.description
    }
  \`\`\`
  `;

    fs.writeFile(`${path}/${exp.name}.md`, output);
  });
}
