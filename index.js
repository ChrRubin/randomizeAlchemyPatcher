/**
 * @file zEdit Patcher - Randomizes the effects of alchemy ingredients.
 * @author ChrRubin
 * @version 1.0
 * @license MIT
 * @copyright ChrRubin 2020
 */

/* global info, xelib, registerPatcher, patcherUrl, patcherPath, fh */

const logPath = `${patcherPath}\\RandomizeAlchemyLog.txt`;

class ChrCustomError extends Error {
    constructor(message) {
        super(message);
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ChrCustomError);
        }
        this.name = "ChrCustomError";
    }
}

class IngrEffect {
    constructor(handle){
        /** @type {number} Handle to effect element */
        this.handle = handle;

        /** @type {number} Handle to linked effect record */
        this.efidLink = xelib.GetLinksTo(handle, "EFID");

        /** @type {string} FormID of linked effect record */
        this.formID = xelib.GetHexFormID(this.efidLink);

        /** @type {string} Name of linked effect record */
        this.name = xelib.Name(this.efidLink);

        /** @type {string} Magnitude of effect rounded to 6 decimal places */
        this.magnitude = xelib.GetFloatValue(handle, "EFIT\\Magnitude").toFixed(6);

        /** @type {number} Area of effect */
        this.area = xelib.GetUIntValue(handle, "EFIT\\Area");

        /** @type {number} Duration of effect */
        this.duration = xelib.GetUIntValue(handle, "EFIT\\Duration");
    }

    /**
     * Check if given effect is the same as this effect.
     * @param {IngrEffect} effect
     * @return {boolean} True if effect is duplicate.
     * @memberof IngrEffect
     */
    isDuplicate(effect){
        return effect.formID === this.formID;
    }
}

class IngrEffectList {
    /**
     * @typedef {Object} UniqueFormIDsObj
     * @property {string} formID FormID
     * @property {number} count Number of occurences
     */
    /**
     * @typedef {Object} GetResultObj
     * @property {number} index Index of result in list
     * @property {IngrEffect} value Value of effect
     */

    /**
     * Creates an instance of IngrEffectList.
     * @param {number[]} handles Array of effect handles
     * @memberof IngrEffectList
     */
    constructor(handles){
        const formIdSet = new Set();

        /** @type {IngrEffect[]} */
        this.list = handles.map(handle => {
            const ingrEffect = new IngrEffect(handle);
            formIdSet.add(ingrEffect.formID);
            return ingrEffect;
        });

        /** @type {UniqueFormIDsObj[]} */
        this.uniqueFormIDs = [];

        formIdSet.forEach(formID => {
            let count = 0;
            this.list.forEach(effect => {
                if(effect.formID === formID){
                    count += 1;
                }
            });
            this.uniqueFormIDs.push({formID: formID, count: count});
        });

        /** @type {UniqueFormIDsObj[]} */
        this.clonedUniqueFormIDs = [...this.uniqueFormIDs];
    }

    /**
     * Gets the first effect with the highest occurence in the list.
     * @return {GetResultObj} Result
     * @memberof IngrEffectList
     */
    getFirstMostOccurrence(){
        /** @type {UniqueFormIDsObj} */
        let most;

        this.uniqueFormIDs.forEach(obj => {
            if(!most || obj.count > most.count){
                most = obj;
            }
        });

        return this.find(most.formID);
    }

    /**
     * Gets one unique effect. This function will only return each unique effect once, and will return 0 if no unique effect remains. 
     * @return {GetResultObj} Result
     * @memberof IngrEffectList
     */
    getUniqueEffect(){
        const uniqueEffect = this.clonedUniqueFormIDs.shift();
        if(!uniqueEffect){
            return 0;
        }

        return this.find(uniqueEffect.formID);
    }

    /**
     * Get random effect from list. This is affected by the effect distribution.
     * @return {GetResultObj} Result
     * @memberof IngrEffectList
     */
    getRandomFromPool(){
        const i = Math.floor(Math.random() * this.list.length);
        return {index: i, value: this.list[i]};
    }

    /**
     * Get random effect from list. This is NOT affected by the effect distribution.
     * @return {GetResultObj} Result
     * @memberof IngrEffectList
     */
    getRandomEffect(){
        const iUnique = Math.floor(Math.random() * this.uniqueFormIDs.length);
        this.list = shuffleArray(this.list);
        return this.find(this.uniqueFormIDs[iUnique].formID);
    }

    /**
     * Find first effect with FormID that matches formID
     * @param {string} formID FormID
     * @return {GetResultObj} Result
     * @memberof IngrEffectList
     */
    find(formID){
        let resultIndex;
        const value = this.list.find((effect, index) => {
            if(effect.formID === formID){
                resultIndex = index;
                return true;
            }
        });

        return {index: resultIndex, value: value};
    }

    /**
     * Removes effect on index i from list.
     * @param {number} i Index of effect
     * @memberof IngrEffectList
     */
    remove(i){
        const effect = this.list[i];
        this.uniqueFormIDs.forEach(obj => {
            if(obj.formID === effect.formID){
                obj.count -= 1;
            }
        });
        this.list.splice(i, 1);
    }
}

/**
 * Shuffles array.
 * Source: https://gist.github.com/guilhermepontes/17ae0cc71fa2b13ea8c20c94c5c35dc4
 * @param {any[]} array Original array
 * @returns {any[]} Shuffled array
 */
function shuffleArray(array) {
    return array.map(a => [Math.random(), a]).sort((a, b) => a[0] - b[0]).map(a => a[1]);
}

registerPatcher({
    info: info,
    gameModes: [xelib.gmSSE, xelib.gmTES5],
    settings: {
        label: 'Alchemy Effects Randomizer',
        templateUrl: `${patcherUrl}/partials/settings.html`,
        controller: function($scope) {
            $scope.showLog = () => {
                if (!fh.jetpack.exists(logPath)){
                    alert("Log file does not exist!");
                    return;
                }
                fh.openFile(logPath);
            };
        },
        defaultSettings: {
            randType: "groups",
            ignoreDist: false,
            setEsl: true,
            showLog: false,
            patchFileName: 'RandomAlchemyPatch.esp'
        }
    },
    execute: (patchFile, helpers, settings, locals) => ({
        initialize: () => {
            const ingrs = helpers.loadRecords("INGR", false);
            if (!ingrs.length){
                throw new ChrCustomError("Failed to load INGR records!");
            }

            // Stores output log strings
            locals.logArray = []; 

            locals.logArray.push(`${new Date().toString()}`);
            locals.logArray.push("");

            const settingsLog = `PATCHER SETTINGS:\nIgnored files: ${settings.ignoredFiles.join(", ")}\nRandomization type: ${settings.randType}\nignoreDist: ${settings.ignoreDist}\nsetEsl: ${settings.setEsl}\npatchFileName: ${settings.patchFileName}`;
            helpers.logMessage(settingsLog);
            locals.logArray.push(settingsLog);

            const winningIngrs = ingrs.map(ingr => xelib.GetWinningOverride(ingr));

            if (settings.randType === "groups"){
                const effectGroups = [];
                winningIngrs.forEach(ingr => {
                    effectGroups.push(xelib.GetElement(ingr, "Effects"));
                });

                locals.effectGroups = shuffleArray(effectGroups);
                locals.index = 0;
            }
            else if (["distribution", "inclusion", "noInclusion"].includes(settings.randType)){
                const effects = [];
                winningIngrs.forEach(ingr => {
                    xelib.GetElements(ingr, "Effects").forEach(effect => {
                        effects.push(effect);
                    });
                });

                locals.effectList = new IngrEffectList(shuffleArray(effects));
            }
            else{
                throw new ChrCustomError("Invalid randomization type selected!");
            }

            locals.winningIngrs = winningIngrs;
        },
        process: [{
            records: (filesToPatch, helpers, settings, locals) => {
                return shuffleArray(locals.winningIngrs);
            },
            patch: (record, helpers, settings, locals) => {
                const formid = xelib.GetHexFormID(record);
                helpers.logMessage(`Patching ${formid}...`);

                const recordEffectsElement = xelib.GetElement(record, "Effects");

                if (settings.randType === "groups"){
                    const newEffectGroup = locals.effectGroups[locals.index];
                    xelib.SetElement(recordEffectsElement, newEffectGroup);
                    locals.index += 1;
                    return;
                }

                /** @type {IngrEffect[]} */
                const addedEffects = [];
                let i = 0;

                while (i < 4) {
                    /** @type {GetResultObj} */
                    let result;

                    if (settings.randType === "distribution" && i === 0){ 
                        result = locals.effectList.getFirstMostOccurrence(); 
                    }
                    else if (settings.randType === "inclusion" && i === 0){
                        result = locals.effectList.getUniqueEffect();
                        if (!result && settings.ignoreDist){
                            result = locals.effectList.getRandomEffect();
                        }
                        else if (!result && !settings.ignoreDist){
                            result = locals.effectList.getRandomFromPool();
                        }
                    }
                    else{
                        if (settings.ignoreDist){
                            result = locals.effectList.getRandomEffect();
                        }
                        else{
                            result = locals.effectList.getRandomFromPool();
                        }
                    }

                    const resultIndex = result.index;
                    const resultEffect = result.value;
                    
                    if (addedEffects.some(effect => effect.isDuplicate(resultEffect))){
                        continue;
                    }
                    
                    addedEffects.push(resultEffect);
                    if (settings.randType === "distribution"){
                        locals.effectList.remove(resultIndex);
                    }

                    const recordEffect = xelib.GetElement(recordEffectsElement, `[${i}]`);
                    xelib.SetElement(recordEffect, resultEffect.handle);
                    i += 1;
                }
            }
        }],
        finalize: () => {
            helpers.logMessage(`Setting ESL flag to ${settings.setEsl}...`);
            xelib.SetRecordFlag(xelib.GetFileHeader(patchFile), "ESL", settings.setEsl);

            helpers.logMessage("Logging INGR changes...");
            xelib.GetElements(patchFile, "INGR").sort((a, b) => xelib.GetFormID(a) - xelib.GetFormID(b)).forEach(ingr => {
                const formid = xelib.GetHexFormID(ingr);
                const masterIngr = xelib.GetMasterRecord(ingr);

                locals.logArray.push("==============================");
                locals.logArray.push(`INGR: ${xelib.Name(ingr)} [${formid}]`);

                const originalEffects = xelib.GetElements(masterIngr, "Effects").map(effect => new IngrEffect(effect));
                locals.logArray.push(`Original effects:`);
                originalEffects.forEach(ingrEffect => locals.logArray.push(`- ${ingrEffect.name} (M: ${ingrEffect.magnitude}, A: ${ingrEffect.area}, D: ${ingrEffect.duration})`));

                const currentEffects = xelib.GetElements(ingr, "Effects").map(effect => new IngrEffect(effect));
                locals.logArray.push(`New effects:`);
                currentEffects.forEach(ingrEffect => locals.logArray.push(`- ${ingrEffect.name} (M: ${ingrEffect.magnitude}, A: ${ingrEffect.area}, D: ${ingrEffect.duration})`));
            });

            helpers.logMessage(`Saving log file to ${logPath}...`);
            fh.saveTextFile(logPath, locals.logArray.join("\n"));

            if(settings.showLog){
                helpers.logMessage("Opening log file...");
                fh.openFile(logPath);
            }
        }
    })
});
