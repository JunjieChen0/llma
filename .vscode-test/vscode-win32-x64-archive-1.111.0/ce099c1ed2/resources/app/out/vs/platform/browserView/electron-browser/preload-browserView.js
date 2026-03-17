/*!--------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
"use strict";(function(){const{contextBridge:e}=require("electron"),r={getSelectedText(){try{return window.getSelection()?.toString()??""}catch{return""}}};try{e.exposeInIsolatedWorld(999,"browserViewAPI",r)}catch(t){console.error(t)}})();
//# sourceMappingURL=preload-browserView.js.map
