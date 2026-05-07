//=============================================================================
// SaveFileIO.js
// Adds a "Download Save" entry to the save screen and an "Upload Save"
// entry to the load screen, both as the first item in the list.
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Adds download/upload options to the save and load screens.
 * @author Custom
 *
 * @help SaveFileIO.js
 *
 * Adds a "Download Save" entry at the top of the save screen.
 * Clicking it downloads the current in-memory game state as a JSON file.
 *
 * Adds an "Upload Save" entry at the top of the load screen.
 * Clicking it opens a file picker. Selecting a previously downloaded JSON
 * file immediately loads that game state.
 */

(() => {
    "use strict";

    // -----------------------------------------------------------------------
    // Window_SavefileList – insert the action slot at index 0
    // -----------------------------------------------------------------------

    // One extra item for the action slot.
    const _maxItems = Window_SavefileList.prototype.maxItems;
    Window_SavefileList.prototype.maxItems = function() {
        return _maxItems.call(this) + 1;
    };

    // Index 0 maps to sentinel savefileId -1 (action slot).
    // All other indices are shifted by one.
    const _indexToSavefileId = Window_SavefileList.prototype.indexToSavefileId;
    Window_SavefileList.prototype.indexToSavefileId = function(index) {
        if (index === 0) return -1;
        return _indexToSavefileId.call(this, index - 1);
    };

    const _savefileIdToIndex = Window_SavefileList.prototype.savefileIdToIndex;
    Window_SavefileList.prototype.savefileIdToIndex = function(savefileId) {
        if (savefileId < 0) return 0;
        return _savefileIdToIndex.call(this, savefileId) + 1;
    };

    // Draw the action slot with a centred label.
    const _drawItem = Window_SavefileList.prototype.drawItem;
    Window_SavefileList.prototype.drawItem = function(index) {
        if (index === 0) {
            const rect = this.itemRectWithPadding(index);
            this.resetTextColor();
            this.changePaintOpacity(true);
            const label = this._mode === "save"
                ? "\u25bc  Download Save"
                : "\u25b2  Upload Save";
            this.drawText(label, rect.x, rect.y + 4, rect.width, "center");
            return;
        }
        _drawItem.call(this, index);
    };

    // The action slot is always selectable.
    const _isEnabled = Window_SavefileList.prototype.isEnabled;
    Window_SavefileList.prototype.isEnabled = function(savefileId) {
        if (savefileId === -1) return true;
        return _isEnabled.call(this, savefileId);
    };

    // -----------------------------------------------------------------------
    // Window_TitleCommand – always enable "Continue" so Upload Save is reachable
    // -----------------------------------------------------------------------

    Window_TitleCommand.prototype.isContinueEnabled = function() {
        return true;
    };

    // -----------------------------------------------------------------------
    // Scene_Save – download the current game state as JSON
    // -----------------------------------------------------------------------

    const _Scene_Save_onSavefileOk = Scene_Save.prototype.onSavefileOk;
    Scene_Save.prototype.onSavefileOk = function() {
        if (this.savefileId() === -1) {
            this.executeDownloadSave();
            return;
        }
        _Scene_Save_onSavefileOk.call(this);
    };

    Scene_Save.prototype.executeDownloadSave = function() {
        try {
            const contents = DataManager.makeSaveContents();
            const json = JsonEx.stringify(contents);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
            const a = document.createElement("a");
            a.href = url;
            a.download = "savegame_" + ts + ".json";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            SoundManager.playSave();
        } catch (e) {
            console.error("SaveFileIO: download failed", e);
            SoundManager.playBuzzer();
        }
        this.activateListWindow();
    };

    // -----------------------------------------------------------------------
    // Scene_Load – upload a JSON save file and load it immediately
    // -----------------------------------------------------------------------

    const _Scene_Load_onSavefileOk = Scene_Load.prototype.onSavefileOk;
    Scene_Load.prototype.onSavefileOk = function() {
        if (this.savefileId() === -1) {
            this.executeUploadSave();
            return;
        }
        _Scene_Load_onSavefileOk.call(this);
    };

    Scene_Load.prototype.executeUploadSave = function() {
        const scene = this;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";
        input.style.display = "none";
        document.body.appendChild(input);

        let handled = false;

        const finish = (success) => {
            if (handled) return;
            handled = true;
            if (document.body.contains(input)) {
                document.body.removeChild(input);
            }
            window.removeEventListener("focus", onWindowFocus);
            if (!success) {
                scene.activateListWindow();
            }
        };

        // Fallback: if the file dialog is dismissed without a selection,
        // the game window regains focus – use that to re-activate the list.
        const onWindowFocus = () => {
            // A short delay lets onchange fire first when a file was picked.
            setTimeout(() => finish(false), 500);
        };

        input.onchange = function(event) {
            const file = event.target.files[0];
            if (!file) {
                finish(false);
                return;
            }
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const contents = JsonEx.parse(e.target.result);
                    // Mark as handled before we leave the scene.
                    handled = true;
                    window.removeEventListener("focus", onWindowFocus);
                    if (document.body.contains(input)) {
                        document.body.removeChild(input);
                    }
                    DataManager.createGameObjects();
                    DataManager.extractSaveContents(contents);
                    DataManager.correctDataErrors();
                    SoundManager.playLoad();
                    scene.fadeOutAll();
                    scene.reloadMapIfUpdated();
                    SceneManager.goto(Scene_Map);
                    scene._loadSuccess = true;
                } catch (err) {
                    console.error("SaveFileIO: upload failed", err);
                    SoundManager.playBuzzer();
                    finish(false);
                }
            };
            reader.onerror = function() {
                console.error("SaveFileIO: file read error");
                SoundManager.playBuzzer();
                finish(false);
            };
            reader.readAsText(file);
        };

        window.addEventListener("focus", onWindowFocus);
        input.click();
    };
})();
