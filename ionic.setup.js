// The app lends Ionic to every plugin frame (app 1.6.0, 2026-10-09): `@ionic/core`'s custom
// elements are registered, with the app's mode, direction and colours, before the plugin's module
// runs, and its controllers are handed over as `globalThis.ftIonic`. The tests do the same with the
// real `@ionic/core`, the version the app ships, so what the plugin draws here is what the phone
// draws. None of it goes into `dist/`.
import { alertController, initialize, toastController } from "@ionic/core/components";
import { defineCustomElement as alert } from "@ionic/core/components/ion-alert.js";
import { defineCustomElement as button } from "@ionic/core/components/ion-button.js";
import { defineCustomElement as buttons } from "@ionic/core/components/ion-buttons.js";
import { defineCustomElement as card } from "@ionic/core/components/ion-card.js";
import { defineCustomElement as cardContent } from "@ionic/core/components/ion-card-content.js";
import { defineCustomElement as content } from "@ionic/core/components/ion-content.js";
import { defineCustomElement as footer } from "@ionic/core/components/ion-footer.js";
import { defineCustomElement as header } from "@ionic/core/components/ion-header.js";
import { defineCustomElement as icon } from "@ionic/core/components/ion-icon.js";
import { defineCustomElement as item } from "@ionic/core/components/ion-item.js";
import { defineCustomElement as label } from "@ionic/core/components/ion-label.js";
import { defineCustomElement as list } from "@ionic/core/components/ion-list.js";
import { defineCustomElement as select } from "@ionic/core/components/ion-select.js";
import { defineCustomElement as selectOption } from "@ionic/core/components/ion-select-option.js";
import { defineCustomElement as spinner } from "@ionic/core/components/ion-spinner.js";
import { defineCustomElement as textarea } from "@ionic/core/components/ion-textarea.js";
import { defineCustomElement as toast } from "@ionic/core/components/ion-toast.js";
import { defineCustomElement as toolbar } from "@ionic/core/components/ion-toolbar.js";

initialize();
const elements = [alert, button, buttons, card, cardContent, content, footer, header, icon, item, label, list, select, selectOption, spinner, textarea, toast, toolbar];
for (const define of elements) define();
globalThis.ftIonic = { alertController, toastController };
