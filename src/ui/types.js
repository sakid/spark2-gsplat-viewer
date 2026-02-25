// npm install dockview-core tweakpane && npm run dev

/**
 * @typedef {Object} PrimDescriptor
 * @property {string} path
 * @property {string} type
 * @property {Record<string, any>} attributes
 * @property {Record<string, any>} variants
 * @property {Array<any>} references
 */

/**
 * @typedef {Object} SplatMeta
 * @property {boolean} isSplatMesh
 * @property {boolean|null} lodEnabled
 * @property {number|null} lodSplatCount
 * @property {number|null} splatCount
 */

/**
 * @typedef {Object} SelectionPayload
 * @property {string[]} uuids
 * @property {any} object
 */

/**
 * @typedef {Object} OutlinerNodeViewModel
 * @property {string} uuid
 * @property {string} label
 * @property {string} type
 * @property {SplatMeta} splat
 * @property {OutlinerNodeViewModel[]} children
 */
