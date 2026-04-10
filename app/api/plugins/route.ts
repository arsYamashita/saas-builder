import { listPlugins } from '../../../packages/saas-core/src'

/**
 * GET /api/plugins
 * 登録済みプラグイン一覧を返す
 */
export async function GET() {
  const plugins = listPlugins()
  return Response.json({ plugins })
}
