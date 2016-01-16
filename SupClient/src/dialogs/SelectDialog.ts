import BaseDialog from "./BaseDialog";
import * as i18n from "../i18n";

interface SelectOptions {
  size?: number;
}

interface SelectCallback {
  (value: string): void;
}

export default class SelectDialog extends BaseDialog {
  selectElt: HTMLSelectElement;

  constructor(label: string, choices: { [value: string]: string; },
  validationLabel: string, options?: SelectOptions, private callback?: SelectCallback) {
    super();

    if (options == null) options = {};

    // Label
    const labelElt = document.createElement("label");
    labelElt.textContent = label;
    this.formElt.appendChild(labelElt);

    // Select
    this.selectElt = document.createElement("select");
    for (const choiceName in choices) {
      const optionElt = document.createElement("option");
      optionElt.value = choiceName;
      optionElt.textContent = choices[choiceName];
      this.selectElt.appendChild(optionElt);
    }

    if (options.size != null) this.selectElt.size = options.size;
    this.formElt.appendChild(this.selectElt);

    this.selectElt.addEventListener("keydown", (event) => {
      if (event.keyCode === 13) { event.preventDefault(); this.submit(); }
    });
    this.selectElt.addEventListener("dblclick", () => { this.submit(); });

    // Buttons
    const buttonsElt = document.createElement("div");
    buttonsElt.className = "buttons";
    this.formElt.appendChild(buttonsElt);

    const cancelButtonElt = document.createElement("button");
    cancelButtonElt.type = "button";
    cancelButtonElt.textContent = i18n.t("common:actions.cancel");
    cancelButtonElt.className = "cancel-button";
    cancelButtonElt.addEventListener("click", (event) => { event.preventDefault(); this.cancel(); });

    this.validateButtonElt = document.createElement("button");
    this.validateButtonElt.textContent = validationLabel;
    this.validateButtonElt.className = "validate-button";

    if (navigator.platform === "Win32") {
      buttonsElt.appendChild(this.validateButtonElt);
      buttonsElt.appendChild(cancelButtonElt);
    } else {
      buttonsElt.appendChild(cancelButtonElt);
      buttonsElt.appendChild(this.validateButtonElt);
    }

    this.selectElt.focus();
  }

  submit() {
    if (!super.submit()) return false;
    if (this.callback != null) this.callback((this.selectElt.value !== "") ? this.selectElt.value : null);
    return true;
  }

  cancel() {
    super.cancel();
    if (this.callback != null) this.callback(null);
  }
}
