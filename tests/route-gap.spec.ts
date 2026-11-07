// @vitest-environment node
// 审计整改：通过 TypeScript AST 解析真实模块导入，不使用全文字符串匹配。
// 覆盖 src/views 下的嵌套视图，并避免注释、普通字符串造成假阳性。
import { expect, it } from 'vitest'
import * as ts from 'typescript'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative, resolve } from 'node:path'

const SOURCE_EXTENSIONS = ['', '.vue', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.vue', '/index.ts']

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, name.name)
    if (name.isDirectory()) walkFiles(file, out)
    else if (/\.(vue|ts|tsx|js|jsx|mjs|cjs)$/.test(name.name)) out.push(file)
  }
  return out
}

function readModuleSpecifiers(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const scripts = extname(file) === '.vue'
    ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1])
    : [text]
  const imports: string[] = []

  for (const script of scripts) {
    const source = ts.createSourceFile(file, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const visit = (node: ts.Node): void => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        imports.push(node.moduleSpecifier.text)
      }
      if (ts.isCallExpression(node) && node.arguments.length === 1 &&
          ts.isStringLiteralLike(node.arguments[0]) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
           (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        imports.push(node.arguments[0].text)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return imports
}

function resolvesToView(specifier: string, sourceFile: string, srcDir: string, target: string): boolean {
  let base: string
  if (specifier.startsWith('@/')) base = resolve(srcDir, specifier.slice(2))
  else if (specifier.startsWith('/src/')) base = resolve(dirname(srcDir), specifier.slice(1))
  else if (specifier.startsWith('.')) base = resolve(dirname(sourceFile), specifier)
  else return false

  return SOURCE_EXTENSIONS.some(extension => {
    const candidate = extension ? base + extension : base
    return existsSync(candidate) && resolve(candidate) === target
  })
}

export function findOrphanViews(repositoryRoot: string): string[] {
  const srcDir = resolve(repositoryRoot, 'src')
  const viewsDir = resolve(srcDir, 'views')
  const views = walkFiles(viewsDir).filter(file => extname(file) === '.vue')
  const sources = walkFiles(srcDir)

  return views
    .filter(view => !sources.some(source => source !== view &&
      readModuleSpecifiers(source).some(specifier =>
        resolvesToView(specifier, source, srcDir, view))))
    .map(view => relative(repositoryRoot, view).split('\\').join('/'))
    .sort()
}

it('每个 views 目录及嵌套目录中的视图都必须存在真实模块引用', () => {
  const orphans = findOrphanViews(process.cwd())
  expect(orphans, `孤立视图（无真实导入入口）：\n${orphans.join('\n')}`).toEqual([])
})

it('检测嵌套视图，并忽略注释和普通字符串中的伪引用', () => {
  const root = mkdtempSync(join(tmpdir(), 'route-gap-'))
  try {
    mkdirSync(join(root, 'src/views/nested'), { recursive: true })
    mkdirSync(join(root, 'src/router'), { recursive: true })
    writeFileSync(join(root, 'src/views/Home.vue'), '<template><div /></template>')
    writeFileSync(join(root, 'src/views/nested/Child.vue'), '<template><div /></template>')
    writeFileSync(join(root, 'src/router/index.ts'), [
      '// import("../views/Home.vue") is only a comment',
      'const note = "../views/nested/Child.vue"',
      'export const routes = [{ component: () => import("../views/Home.vue") }]',
    ].join('\n'))
    expect(findOrphanViews(root)).toEqual(['src/views/nested/Child.vue'])
    writeFileSync(join(root, 'src/router/index.ts'),
      'export const routes = [{ component: () => import("../views/Home.vue") }, { component: () => import("../views/nested/Child.vue") }]')
    expect(findOrphanViews(root)).toEqual([])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
