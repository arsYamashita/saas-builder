// プラグイン登録（import 順で自動 register される）
import './plugins/notify'

export { PLUGIN_REGISTRY, registerPlugin, getPlugin, listPlugins } from './plugins/manifest'
export type { SaasPlugin } from './plugins/manifest'
