import { PLUGIN_REGISTRY } from '../../../../packages/saas-core/src'

/**
 * POST /api/plugins/[name]
 * 指定プラグインを実行する
 */
export async function POST(
  req: Request,
  { params }: { params: { name: string } },
) {
  const plugin = PLUGIN_REGISTRY[params.name]
  if (!plugin) {
    return Response.json({ error: `Plugin '${params.name}' not found` }, { status: 404 })
  }

  if (plugin.requiresApproval) {
    return Response.json(
      { error: 'This plugin requires manual approval before execution' },
      { status: 403 },
    )
  }

  let input: unknown
  try {
    input = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const result = await plugin.execute(input)
    return Response.json({ ok: true, result })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return Response.json({ ok: false, error: message }, { status: 400 })
  }
}
