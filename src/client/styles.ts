/**
 * 插件自有样式与官方阅读器样式的注入。
 * 只引用宿主主题变量（--dsw-alias-* / --dsw-radius-*），深浅色切换自动跟随。
 */

/** 插件自有样式表。 */
const PLUGIN_CSS = `
.ofd-pv-container{position:relative;width:100%;height:100%;min-height:0}
.ofd-pv-container>.ofd-pv-host{position:absolute;inset:0;width:100%;height:100%;min-height:0;color:var(--dsw-alias-label-primary)}
.ofd-pv-status{box-sizing:border-box;position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;font-family:var(--dsw-font,sans-serif);font-size:13px;line-height:1.5;text-align:center;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2)}
.ofd-pv-status-error{color:var(--dsw-alias-state-error-primary)}
.ofd-pv-panel{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font,sans-serif)}
.ofd-pv-head{box-sizing:border-box;display:flex;align-items:center;gap:8px;flex:none;height:44px;padding:0 8px 0 16px;border-bottom:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}
.ofd-pv-head-main{display:flex;align-items:center;gap:8px;flex:1;min-width:0}
.ofd-pv-actions{display:flex;align-items:center;gap:2px;flex:none;min-width:0;overflow-x:auto;scrollbar-width:thin}
.ofd-pv-tool{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 6px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:1;cursor:pointer}
.ofd-pv-tool:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.ofd-pv-tool:disabled{opacity:.4;cursor:default}
.ofd-pv-tool[aria-expanded=true],.ofd-pv-tool[aria-pressed=true]{color:var(--dsw-alias-brand-primary)}
.ofd-pv-page{display:inline-flex;align-items:center;gap:4px;flex:none}
.ofd-pv-page-input{width:44px;height:28px;box-sizing:border-box;padding:0 4px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;text-align:center}
.ofd-pv-page-input::-webkit-outer-spin-button,.ofd-pv-page-input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.ofd-pv-page-total{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.ofd-pv-sep{flex:none;width:1px;height:18px;margin:0 4px;background:var(--dsw-alias-border-l2)}
.ofd-pv-select{flex:none;height:28px;padding:0 4px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}
.ofd-pv-select:disabled{opacity:.4;cursor:default}
.ofd-pv-name{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}
.ofd-pv-meta{flex:none;font-size:12px;color:var(--dsw-alias-label-secondary)}
.ofd-pv-badge{flex:none;padding:1px 5px;border-radius:4px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted,#fff);font-family:var(--ds-font-family-code,monospace);font-size:10px;line-height:16px;font-weight:600;letter-spacing:.02em}
.ofd-pv-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;line-height:1}
.ofd-pv-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.ofd-pv-body{position:relative;display:flex;flex:1;min-height:0}
.ofd-pv-body>.ofd-pv-container{flex:1}
.ofd-pv-body-inline{box-sizing:border-box;flex:1;min-height:0;padding:12px}
.ofd-pv-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;height:100%;padding:24px;font-size:13px;line-height:1.6;text-align:center;color:var(--dsw-alias-label-secondary)}
.ofd-pv-empty-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
.ofd-pv-chip{flex:none;display:inline-flex;align-items:center;height:20px;padding:0 7px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1;cursor:pointer}
.ofd-pv-chip[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.ofd-pv-inline{width:100%;height:100%;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
.ofd-pv-doc{position:relative;display:flex;flex:1;width:100%;height:100%;min-height:0}
.ofd-pv-doc>.ofd-pv-container{flex:1}
.ofd-pv-rail{display:flex;flex-wrap:wrap;gap:8px;padding:0 0 8px}
.ofd-pv-image{position:relative;flex:none;width:64px;height:64px}
.ofd-pv-thumb{box-sizing:border-box;display:block;width:64px;height:64px;padding:0;overflow:hidden;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-interactive-bg-hover);cursor:zoom-in}
.ofd-pv-thumb img{display:block;width:100%;height:100%;object-fit:cover}
.ofd-pv-image-remove{position:absolute;top:4px;right:4px;z-index:1;display:grid;place-items:center;width:18px;height:18px;padding:0;border:none;border-radius:50%;background:var(--dsw-alias-button-contrast-fill);color:var(--dsw-alias-label-primary-inverted,#fff);opacity:0;cursor:pointer;font-size:11px;line-height:1;transition:opacity .2s ease-in-out}
.ofd-pv-image:hover .ofd-pv-image-remove,.ofd-pv-image-remove:focus-visible{opacity:1}
@media (pointer:coarse){.ofd-pv-image-remove{opacity:1}}
.ofd-pv-lightbox{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:32px;background:var(--dsw-alias-bg-overlay,rgba(0,0,0,.72));cursor:zoom-out}
.ofd-pv-lightbox-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:var(--dsw-radius-lg);cursor:default}
.ofd-pv-lightbox-close{position:absolute;top:16px;right:16px;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:none;border-radius:50%;background:var(--dsw-alias-button-contrast-fill);color:var(--dsw-alias-label-primary-inverted,#fff);font-size:14px;line-height:1;cursor:pointer}
.ofd-pv-card{box-sizing:border-box;position:relative;display:inline-flex;align-items:center;gap:10px;width:240px;height:64px;padding:0 12px;border:.5px solid var(--dsw-alias-border-l2,#0000001f);border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-layer-2));text-align:left}
.ofd-pv-card[data-state=error]{border-color:var(--dsw-alias-state-error-primary)}
.ofd-pv-card-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted,#fff);font-family:var(--ds-font-family-code,monospace);font-size:9px;font-weight:700}
.ofd-pv-card-icon[data-kind=other]{background:var(--dsw-alias-state-idle-primary)}
.ofd-pv-card-body{display:flex;flex-direction:column;flex:1;min-width:0;padding:8px 0}
.ofd-pv-card-name{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:14px;font-weight:500;line-height:22px;color:var(--dsw-alias-label-primary)}
.ofd-pv-card-meta{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;line-height:15px;color:var(--dsw-alias-label-secondary)}
.ofd-pv-card-meta[data-failed=true]{color:var(--dsw-alias-state-error-primary)}
.ofd-pv-card-open{flex:none;display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:24px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1;cursor:pointer}
.ofd-pv-card-open:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.ofd-pv-card-open:disabled{cursor:default;color:var(--dsw-alias-label-secondary);opacity:.7}
.ofd-pv-card-remove{position:absolute;top:6px;right:6px;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;padding:0;border:none;border-radius:50%;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);opacity:0;cursor:pointer;font-size:11px;line-height:1;transition:opacity .2s ease-in-out}
.ofd-pv-card:hover .ofd-pv-card-remove,.ofd-pv-card-remove:focus-visible{opacity:1}
@media (pointer:coarse){.ofd-pv-card-remove{opacity:1}}
.ofd-pv-entry{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:24px;padding:0 6px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code,monospace);font-size:10px;font-weight:600;line-height:1;cursor:pointer}
.ofd-pv-entry:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary)}
.ofd-pv-entry[data-active=true]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.ofd-pv-drop{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;margin:8px;border:2px dashed var(--dsw-alias-brand-primary);border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 88%,transparent);color:var(--dsw-alias-label-primary);font-size:14px;pointer-events:none}
`

/**
 * 注入一段样式；已存在同 id 样式时不重复注入。
 *
 * @param id 样式标识（写入 data-plugin-css）
 * @param css 样式文本
 * @returns 解除注入的函数
 */
function injectStyle(id: string, css: string): () => void {
  if (document.querySelector(`style[data-plugin-css="${id}"]`) !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-ofd-viewer'
  tag.dataset.pluginCss = id
  tag.textContent = css
  document.head.appendChild(tag)
  return () => tag.remove()
}

/**
 * 注入插件自有样式。
 *
 * @returns 解除注入的函数
 */
export function mountPluginStyles(): () => void {
  return injectStyle('dsh-ofd-viewer/plugin.css', PLUGIN_CSS)
}

/**
 * 注入官方阅读器样式（同一文档只保留一份）。
 *
 * @param css 官方样式文本
 * @returns 解除注入的函数
 */
export function mountViewerStyles(css: string): () => void {
  return injectStyle('dsh-ofd-viewer/ofdrw-viewer.css', css)
}
