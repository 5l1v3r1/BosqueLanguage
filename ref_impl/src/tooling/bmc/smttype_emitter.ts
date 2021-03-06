//-------------------------------------------------------------------------------------------------------
// Copyright (C) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE.txt file in the project root for full license information.
//-------------------------------------------------------------------------------------------------------

import { MIRAssembly, MIRType, MIREntityTypeDecl, MIRTupleType, MIRRecordType, MIREntityType, MIRConceptType, MIREphemeralListType, MIRRecordTypeEntry } from "../../compiler/mir_assembly";

import { MIRResolvedTypeKey, MIRNominalTypeKey, MIRFieldKey } from "../../compiler/mir_ops";
import { SMTExp, SMTValue } from "./smt_exp";

import * as assert from "assert";

class SMTTypeEmitter {
    readonly assembly: MIRAssembly;

    readonly anyType: MIRType;

    readonly noneType: MIRType;
    readonly boolType: MIRType;
    readonly intType: MIRType;
    readonly stringType: MIRType;

    readonly keyType: MIRType;
    readonly validatorType: MIRType;
    readonly podType: MIRType;
    readonly apiType: MIRType;
    readonly tupleType: MIRType;
    readonly recordType: MIRType;
    
    readonly enumtype: MIRType;
    readonly idkeytype: MIRType;
    readonly guididkeytype: MIRType;
    readonly logicaltimeidkeytype: MIRType;
    readonly contenthashidkeytype: MIRType;    

    private mangledNameMap: Map<string, string> = new Map<string, string>();

    conceptSubtypeRelation: Map<MIRNominalTypeKey, MIRNominalTypeKey[]> = new Map<MIRNominalTypeKey, MIRNominalTypeKey[]>();

    constructor(assembly: MIRAssembly) {
        this.assembly = assembly;

        this.anyType = assembly.typeMap.get("NSCore::Any") as MIRType;

        this.noneType = assembly.typeMap.get("NSCore::None") as MIRType;
        this.boolType = assembly.typeMap.get("NSCore::Bool") as MIRType;
        this.intType = assembly.typeMap.get("NSCore::Int") as MIRType;
        this.stringType = assembly.typeMap.get("NSCore::String") as MIRType;

        this.keyType = assembly.typeMap.get("NSCore::KeyType") as MIRType;
        this.validatorType = assembly.typeMap.get("NSCore::Validator") as MIRType;
        this.podType = assembly.typeMap.get("NSCore::PODType") as MIRType;
        this.apiType = assembly.typeMap.get("NSCore::APIType") as MIRType;
        this.tupleType = assembly.typeMap.get("NSCore::Tuple") as MIRType;
        this.recordType = assembly.typeMap.get("NSCore::Record") as MIRType;

        this.enumtype = assembly.typeMap.get("NSCore::Enum") as MIRType;
        this.idkeytype = assembly.typeMap.get("NSCore::IdKey") as MIRType;
        this.guididkeytype = assembly.typeMap.get("NSCore::GUIDIdKey") as MIRType;
        this.logicaltimeidkeytype = assembly.typeMap.get("NSCore::LogicalTimeIdKey") as MIRType;
        this.contenthashidkeytype = assembly.typeMap.get("NSCore::ContentHashIdKey") as MIRType;
    }

    mangleStringForSMT(name: string): string {
        if (!this.mangledNameMap.has(name)) {
            const cleanname = name.replace(/\W/g, "_").toLowerCase() + "I" + this.mangledNameMap.size + "I";
            this.mangledNameMap.set(name, cleanname);
        }

        return this.mangledNameMap.get(name) as string;
    }

    getMIRType(tkey: MIRResolvedTypeKey): MIRType {
        return this.assembly.typeMap.get(tkey) as MIRType;
    }

    typecheckIsName(tt: MIRType, oftype: RegExp, match?: "exact" | "may"): boolean {
        match = match || "exact";
        if(match === "exact") {
            return tt.options.length === 1 && (tt.options[0] instanceof MIREntityType) && oftype.test(tt.options[0].trkey);
        }
        else {
            return tt.options.some((opt) => (opt instanceof MIREntityType) && oftype.test(opt.trkey));
        }
    }

    typecheckEntityAndProvidesName(tt: MIRType, oftype: MIRType, match?: "exact" | "may"): boolean {
        match = match || "exact";
        if(match === "exact") {
            return tt.options.length === 1 && (tt.options[0] instanceof MIREntityType) && this.assembly.subtypeOf(tt, oftype);
        }
        else {
            return tt.options.some((opt) => (opt instanceof MIREntityType) && this.assembly.subtypeOf(MIRType.createSingle(opt), oftype));
        }
    }

    typecheckTuple(tt: MIRType, match?: "known" | "tuple"): boolean {
        match = match || "tuple";
        if(match === "known") {
            return tt.options.length === 1 && (tt.options[0] instanceof MIRTupleType) && !(tt.options[0] as MIRTupleType).entries.some((entry) => entry.isOptional);
        }
        else {
            return tt.options.every((opt) => opt instanceof MIRTupleType);
        }
    }

    typecheckRecord(tt: MIRType, match?: "known" | "record"): boolean {
        match = match || "record";
        if(match === "known") {
            return tt.options.length === 1 && (tt.options[0] instanceof MIRRecordType) && !(tt.options[0] as MIRRecordType).entries.some((entry) => entry.isOptional);
        }
        else {
            return tt.options.every((opt) => opt instanceof MIRRecordType);
        }
    }

    typecheckUEntity(tt: MIRType, match?: "exact" | "may"): boolean {
        match = match || "exact";
        if(match === "exact") {
            return tt.options.length === 1 && (tt.options[0] instanceof MIREntityType) && tt.options[0].trkey !== "NSCore::None";
        }
        else {
            return tt.options.some((opt) => (opt instanceof MIREntityType) && opt.trkey !== "NSCore::None");
        }
    }

    typecheckAllKeys(tt: MIRType): boolean {
        return tt.options.every((opt) => this.assembly.subtypeOf(MIRType.createSingle(opt), this.keyType));
    }

    typecheckEphemeral(tt: MIRType): boolean {
        return tt.options.length === 1 && tt.options[0] instanceof MIREphemeralListType;
    }
    
    typecheckIsNoneable(tt: MIRType): boolean {
        return tt.options.some((opt) => (opt instanceof MIREntityType) && opt.trkey === "NSCore::None");
    }

    typecheckIsPOD_Always(tt: MIRType): boolean {
        return this.assembly.subtypeOf(tt, this.podType);
    }

    typecheckIsPOD_Never(tt: MIRType): boolean {
        return tt.options.every((opt) => {
            if(opt instanceof MIREntityType) {
                return !this.assembly.subtypeOf(this.getMIRType(opt.trkey), this.podType);
            }
            else if (opt instanceof MIRConceptType) {
                return false; //TODO: this is very conservative -- we could do better by enumerating possible entities 
            }
            else if (opt instanceof MIRTupleType) {
                return opt.entries.some((entry) => !entry.isOptional && this.typecheckIsPOD_Never(entry.type));
            }
            else if (opt instanceof MIRRecordType) {
                return opt.entries.some((entry) => !entry.isOptional && this.typecheckIsPOD_Never(entry.type));
            }
            else {
                return false;
            }
        });
    }

    typecheckIsAPI_Always(tt: MIRType): boolean {
        return this.assembly.subtypeOf(tt, this.apiType);
    }

    typecheckIsAPI_Never(tt: MIRType): boolean {
        return tt.options.every((opt) => {
            if(opt instanceof MIREntityType) {
                return !this.assembly.subtypeOf(this.getMIRType(opt.trkey), this.apiType);
            }
            else if (opt instanceof MIRConceptType) {
                return false; //TODO: this is very conservative -- we could do better by enumerating possible entities 
            }
            else if (opt instanceof MIRTupleType) {
                return opt.entries.some((entry) => !entry.isOptional && this.typecheckIsAPI_Never(entry.type));
            }
            else if (opt instanceof MIRRecordType) {
                return opt.entries.some((entry) => !entry.isOptional && this.typecheckIsAPI_Never(entry.type));
            }
            else {
                return false;
            }
        });
    }

    generateInitialDataKindFlag(tt: MIRType): string {
        if(this.typecheckIsPOD_Always(tt)) {
            return "3";
        }

        if(this.typecheckIsAPI_Always(tt)) {
            return "1";
        }

        if(this.typecheckIsAPI_Never(tt) && this.typecheckIsPOD_Never(tt)) {
            return "0";
        }

        return "unknown";
    }

    getSMTTypeFor(tt: MIRType): string {
        if (this.typecheckIsName(tt, /^NSCore::Bool$/)) {
            return "Bool";
        }
        else if (this.typecheckIsName(tt, /^NSCore::Int$/)) {
            return "Int";
        }
        else if (this.typecheckIsName(tt, /^NSCore::String$/)) {
            return "String";
        }
        else if (this.typecheckIsName(tt, /^NSCore::SafeString<.*>$/)) {
            return "bsq_safestring";
        }
        else if (this.typecheckIsName(tt, /^NSCore::StringOf<.*>$/)) {
            return "bsq_stringof";
        }
        else if (this.typecheckIsName(tt, /^NSCore::GUID$/)) {
            return "bsq_guid";
        }
        else if (this.typecheckIsName(tt, /^NSCore::LogicalTime$/)) {
            return "bsq_logicaltime";
        }
        else if (this.typecheckIsName(tt, /^NSCore::DataHash$/)) {
            return "bsq_datahash";
        }
        else if (this.typecheckIsName(tt, /^NSCore::CryptoHash$/)) {
            return "bsq_cryptohash";
        }
        else if (this.typecheckEntityAndProvidesName(tt, this.enumtype)) {
            return "bsq_enum";
        }
        else if (this.typecheckEntityAndProvidesName(tt, this.idkeytype)) {
            return "bsq_idkey";
        }
        else if (this.typecheckEntityAndProvidesName(tt, this.guididkeytype)) {
            return "bsq_idkey_guid";
        }
        else if (this.typecheckEntityAndProvidesName(tt, this.logicaltimeidkeytype)) {
            return "bsq_idkey_logicaltime";
        }
        else if (this.typecheckEntityAndProvidesName(tt, this.contenthashidkeytype)) {
            return "bsq_idkey_cryptohash";
        }
        else {
            if(this.typecheckAllKeys(tt)) {
                return "BKeyValue";
            }
            else if (this.typecheckIsName(tt, /^NSCore::Buffer<.*>$/)) {
                return "bsq_buffer";
            }
            else if (this.typecheckIsName(tt, /^NSCore::ISOTime$/)) {
                return "bsq_isotime";
            }
            else if (this.typecheckIsName(tt, /^NSCore::Regex$/)) {
                return "bsq_regex";
            }
            else if (this.typecheckTuple(tt)) {
                return "bsq_tuple";
            }
            else if (this.typecheckRecord(tt)) {
                return "bsq_record";
            }
            else if(this.typecheckUEntity(tt)) {
                return this.mangleStringForSMT(tt.trkey)
            }
            else if(this.typecheckEphemeral(tt)) {
                return this.mangleStringForSMT(tt.trkey);
            }
            else {
                return "BTerm";
            }
        }
    }

    private coerceFromAtomicKey(exp: SMTExp, from: MIRType, into: MIRType): SMTExp {
        const intotype = this.getSMTTypeFor(into);

        if (from.trkey === "NSCore::None") {
            return (intotype === "BKeyValue") ? new SMTValue("bsqkey_none") : new SMTValue(`bsqterm_none`);
        }
        else {
            let ctoval = "[NOT SET]";

            if (this.typecheckIsName(from, /^NSCore::Bool$/)) {
                ctoval = `(bsqkey_bool ${exp.emit()})`;
            }
            else if (this.typecheckIsName(from, /^NSCore::Int$/)) {
                ctoval = `(bsqkey_int ${exp.emit()})`;
            }
            else if (this.typecheckIsName(from, /^NSCore::String$/)) {
                ctoval = `(bsqkey_string ${exp.emit()})`;
            }
            else if (this.typecheckIsName(from, /^NSCore:<.*>$/)) {
                ctoval = `(bsq_safestring ${exp.emit()})`;
            }
            else if (this.typecheckIsName(from, /^NSCore::StringOf<.*>$/)) {
                ctoval = `(bsqkey_stringof ${exp.emit()})`;
            }
            else if (this.typecheckIsName(from, /^NSCore::GUID$/)) {
                ctoval = `(bsqkey_guid ${exp.emit()})`;
            }
            else if (this.typecheckIsName(from, /^NSCore::LogicalTime$/)) {
                ctoval = `(bsqkey_logicaltime ${exp.emit()})`;
            }
            else if (this.typecheckIsName(from, /^NSCore::DataHash$/)) {
                ctoval = `(bsqkey_datahash ${exp.emit()})`;
            }
            else if (this.typecheckIsName(from, /^NSCore::CryptoHash$/)) {
                ctoval = `(bsqkey_cryptohash ${exp.emit()})`;
            }
            else if (this.typecheckEntityAndProvidesName(from, this.enumtype)) {
                ctoval = `(bsqkey_enum ${exp.emit()})`;
            }
            else if (this.typecheckEntityAndProvidesName(from, this.idkeytype)) {
                ctoval = `(bsqkey_idkey ${exp.emit()})`;
            }
            else if (this.typecheckEntityAndProvidesName(from, this.guididkeytype)) {
                ctoval = `(bsqkey_idkey_guid ${exp.emit()})`;
            }
            else if (this.typecheckEntityAndProvidesName(from, this.logicaltimeidkeytype)) {
                ctoval = `(bsqkey_idkey_logicaltime ${exp.emit()})`;
            }
            else {
                ctoval = `(bsqkey_idkey_cryptohash ${exp.emit()})`;
            }

            return (intotype === "BKeyValue") ? new SMTValue(ctoval) : new SMTValue(`(bsqterm_key ${ctoval})`);
        }
    }

    private coerceFromOptionsKey(exp: SMTExp, into: MIRType): SMTExp {
        if (this.typecheckIsName(into, /^NSCore::Bool$/)) {
            return new SMTValue(`(bsqkey_bool_value ${exp.emit()})`);
        }
        else if (this.typecheckIsName(into, /^NSCore::Int$/)) {
            return new SMTValue(`(bsqkey_int_value ${exp.emit()})`);
        }
        else if (this.typecheckIsName(into, /^NSCore::String$/)) {
            return new SMTValue(`(bsqkey_string_value ${exp.emit()})`);
        }
        else if (this.typecheckIsName(into, /^NSCore::SafeString<.*>$/)) {
            return new SMTValue(`(bsqkey_safestring_value ${exp.emit()})`);
        }
        else if (this.typecheckIsName(into, /^NSCore::StringOf<.*>$/)) {
            return new SMTValue(`(bsqkey_stringof_value ${exp.emit()})`);
        }
        else if (this.typecheckIsName(into, /^NSCore::GUID$/)) {
            return new SMTValue(`(bsqkey_guid_value ${exp.emit()})`);
        }
        else if (this.typecheckIsName(into, /^NSCore::LogicalTime$/)) {
            return new SMTValue(`(bsqkey_logicaltime_value ${exp.emit()})`);
        }
        else if (this.typecheckIsName(into, /^NSCore::DataHash$/)) {
            return new SMTValue( `(bsqkey_datahash_value ${exp.emit()})`);
        }
        else if (this.typecheckIsName(into, /^NSCore::CryptoHash$/)) {
            return new SMTValue(`(bsqkey_cryptohash_value ${exp.emit()})`);
        }
        else if (this.typecheckEntityAndProvidesName(into, this.enumtype)) {
            return new SMTValue(`(bsqkey_enum_value ${exp.emit()})`);
        }
        else if (this.typecheckEntityAndProvidesName(into, this.idkeytype)) {
            return new SMTValue(`(bsqkey_idkey_value ${exp.emit()})`);
        }
        else if (this.typecheckEntityAndProvidesName(into, this.guididkeytype)) {
            return new SMTValue(`(bsqkey_idkey_guid_value ${exp.emit()})`);
        }
        else if (this.typecheckEntityAndProvidesName(into, this.logicaltimeidkeytype)) {
            return new SMTValue(`(bsqkey_idkey_logicaltime_value ${exp.emit()})`);
        }
        else {
            return new SMTValue(`(bsqkey_idkey_cryptohash_value ${exp.emit()})`);
        }
    }

    private coerceFromAtomicTerm(exp: SMTExp, from: MIRType): SMTExp {
        if (this.typecheckIsName(from, /^NSCore::Buffer<.*>$/)) {
            return new SMTValue(`(bsqterm_buffer ${exp.emit()})`);
        }
        else if (this.typecheckIsName(from, /^NSCore::ISOTime$/)) {
            return new SMTValue(`(bsqterm_isotime ${exp.emit()})`);
        }
        else if (this.typecheckIsName(from, /^NSCore::Regex$/)) {
            return new SMTValue(`(bsqterm_regex ${exp.emit()})`);
        }
        else if (this.typecheckTuple(from)) {
            return new SMTValue(`(bsqterm_tuple ${exp.emit()})`);
        }
        else if (this.typecheckRecord(from)) {
            return new SMTValue(`(bsqterm_record ${exp.emit()})`);
        }
        else {
            return new SMTValue(`(bsqterm_object "${this.mangleStringForSMT(from.trkey)}" (cons@bsq_object_from_${this.mangleStringForSMT(from.trkey)} ${exp.emit()}))`);
        }
    }

    private coerceIntoAtomicKey(exp: SMTExp, into: MIRType): SMTExp {
        if (into.trkey === "NSCore::None") {
            return new SMTValue("bsqkey_none");
        }
        else {
            const cfrom = `(bsqterm_key_value ${exp.emit()})`;

            if (this.typecheckIsName(into, /^NSCore::Bool$/)) {
                return new SMTValue(`(bsqkey_bool_value ${cfrom})`);
            }
            else if (this.typecheckIsName(into, /^NSCore::Int$/)) {
                return new SMTValue(`(bsqkey_int_value ${cfrom})`);
            }
            else if (this.typecheckIsName(into, /^NSCore::String$/)) {
                return new SMTValue(`(bsqkey_string_value ${cfrom})`);
            }
            else if (this.typecheckIsName(into, /^NSCore::SafeString<.*>$/)) {
                return new SMTValue(`(bsq_safestring_value ${cfrom})`);
            }
            else if (this.typecheckIsName(into, /^NSCore::StringOf<.*>$/)) {
                return new SMTValue(`(bsq_stringof_value ${cfrom})`);
            }
            else if (this.typecheckIsName(into, /^NSCore::GUID$/)) {
                return new SMTValue(`(bsq_guid_value ${cfrom})`);
            }
            else if (this.typecheckIsName(into, /^NSCore::LogicalTime$/)) {
                return new SMTValue(`(bsq_logicaltime_value ${cfrom})`);
            }
            else if (this.typecheckIsName(into, /^NSCore::DataHash$/)) {
                return new SMTValue(`(bsq_datahash_value ${cfrom})`);
            }
            else if (this.typecheckIsName(into, /^NSCore::CryptoHash$/)) {
                return new SMTValue(`(bsq_cryptohash_value ${cfrom})`);
            }
            else if (this.typecheckEntityAndProvidesName(into, this.enumtype)) {
                return new SMTValue(`(bsq_enum_value ${cfrom})`);
            }
            else if (this.typecheckEntityAndProvidesName(into, this.idkeytype)) {
                return new SMTValue(`(bsq_idkey_value ${cfrom})`);
            }
            else if (this.typecheckEntityAndProvidesName(into, this.guididkeytype)) {
                return new SMTValue(`(bsq_idkey_guid_value ${cfrom})`);
            }
            else if (this.typecheckEntityAndProvidesName(into, this.logicaltimeidkeytype)) {
                return new SMTValue(`(bsq_idkey_logicaltime_value ${cfrom})`);
            }
            else {
                return new SMTValue(`(bsq_idkey_cryptohash_value ${cfrom})`);
            }
        }
    }

    private coerceIntoAtomicTerm(exp: SMTExp, into: MIRType): SMTExp {
        if (this.typecheckIsName(into, /^NSCore::Buffer<.*>$/)) {
            return new SMTValue(`(bsqterm_buffer_value ${exp.emit()})`);
        }
        else if (this.typecheckIsName(into, /^NSCore::ISOTime$/)) {
            return new SMTValue(`(bsqterm_isotime_value ${exp.emit()})`);
        }
        else if (this.typecheckIsName(into, /^NSCore::Regex$/)) {
            return new SMTValue(`(bsqterm_regex_value ${exp.emit()})`);
        }
        else if (this.typecheckTuple(into)) {
            return new SMTValue(`(bsqterm_tuple_value ${exp.emit()})`);
        }
        else if (this.typecheckRecord(into)) {
            return new SMTValue(`(bsqterm_record_value ${exp.emit()})`);
        }
        else {
            return new SMTValue(`(bsqterm_object_${this.mangleStringForSMT(into.trkey)}_value (bsqterm_object_value ${exp.emit()}))`);
        }
    }

    coerce(exp: SMTExp, from: MIRType, into: MIRType): SMTExp {
        if (this.getSMTTypeFor(from) === this.getSMTTypeFor(into)) {
            return exp;
        }

        if (from.trkey === "NSCore::None") {
            return this.coerceFromAtomicKey(exp, from, into);
        }
        else if (this.typecheckIsName(from, /^NSCore::Bool$/) || this.typecheckIsName(from, /^NSCore::Int$/) || this.typecheckIsName(from, /^NSCore::String$/)) {
            return this.coerceFromAtomicKey(exp, from, into);
        }
        else if (this.typecheckIsName(from, /^NSCore::SafeString<.*>$/) || this.typecheckIsName(from, /^NSCore::StringOf<.*>$/) 
            || this.typecheckIsName(from, /^NSCore::GUID$/) || this.typecheckIsName(from, /^NSCore::LogicalTime$/)
            || this.typecheckIsName(from, /^NSCore::DataHash$/) || this.typecheckIsName(from, /^NSCore::CryptoHash$/)) {
            return this.coerceFromAtomicKey(exp, from, into);
        }
        else if (this.typecheckEntityAndProvidesName(from, this.enumtype) || this.typecheckEntityAndProvidesName(from, this.idkeytype) || this.typecheckEntityAndProvidesName(from, this.guididkeytype)
            || this.typecheckEntityAndProvidesName(from, this.logicaltimeidkeytype) || this.typecheckEntityAndProvidesName(from, this.contenthashidkeytype)) {
            return this.coerceFromAtomicKey(exp, from, into);
        }
        else if (this.typecheckAllKeys(from)) {
            const intotype = this.getSMTTypeFor(into);
            if(intotype === "BTerm") {
                return new SMTValue(`(bsqterm_key ${exp})`);
            }
            else {
                return this.coerceFromOptionsKey(exp, into);
            }
        }
        else if (this.typecheckIsName(from, /^NSCore::Buffer<.*>$/) || this.typecheckIsName(from, /^NSCore::ISOTime$/) || this.typecheckIsName(from, /^NSCore::Regex$/)) {
            return this.coerceFromAtomicTerm(exp, from);
        }
        else if (this.typecheckTuple(from) || this.typecheckRecord(from)) {
            return this.coerceFromAtomicTerm(exp, from);
        }
        else if (this.typecheckUEntity(from)) {
            return this.coerceFromAtomicTerm(exp, from);
        }
        else {
            //now from must be Bterm so we are projecting down
            assert(this.getSMTTypeFor(from) === "BTerm");

            if (into.trkey === "NSCore::None") {
                return this.coerceIntoAtomicKey(exp, into);
            }
            else if (this.typecheckIsName(into, /^NSCore::Bool$/) || this.typecheckIsName(into, /^NSCore::Int$/) || this.typecheckIsName(into, /^NSCore::String$/)) {
                return this.coerceIntoAtomicKey(exp, into);
            }
            else if (this.typecheckIsName(into, /^NSCore::SafeString<.*>$/) || this.typecheckIsName(into, /^NSCore::StringOf<.*>$/) 
                || this.typecheckIsName(into, /^NSCore::GUID$/) || this.typecheckIsName(into, /^NSCore::LogicalTime$/)
                || this.typecheckIsName(into, /^NSCore::DataHash$/) || this.typecheckIsName(into, /^NSCore::CryptoHash$/)) {
                return this.coerceIntoAtomicKey(exp, into);
            }
            else if (this.typecheckEntityAndProvidesName(into, this.enumtype) || this.typecheckEntityAndProvidesName(into, this.idkeytype) || this.typecheckEntityAndProvidesName(into, this.guididkeytype)
                || this.typecheckEntityAndProvidesName(into, this.logicaltimeidkeytype) || this.typecheckEntityAndProvidesName(into, this.contenthashidkeytype)) {
                return this.coerceIntoAtomicKey(exp, into);
            }
            else if (this.typecheckAllKeys(into)) {
                return new SMTValue(`(bsqterm_key_value ${exp.emit()})`);
            }
            else if (this.typecheckIsName(into, /^NSCore::Buffer<.*>$/) || this.typecheckIsName(into, /^NSCore::ISOTime$/) || this.typecheckIsName(into, /^NSCore::Regex$/)) {
                return this.coerceIntoAtomicTerm(exp, into);
            }
            else if (this.typecheckTuple(into) || this.typecheckRecord(into)) {
                return this.coerceIntoAtomicTerm(exp, into);
            }
            else {
                assert(this.typecheckUEntity(into));

                return this.coerceIntoAtomicTerm(exp, into);
            }
        }
    }

    getKeyProjectedTypeFrom(ktype: MIRType): MIRType {
        if(this.typecheckAllKeys(ktype)) {
            return ktype;
        }
        else {
            assert(false);
            return ktype;
        }
    }

    getKeyFrom(arg: string, atype: MIRType): string {
        if(this.typecheckAllKeys(atype)) {
            return arg;
        }
        else {
            assert(false);
            return "[NOT IMPLEMENTED]";
        }
    }

    tupleHasIndex(tt: MIRType, idx: number): "yes" | "no" | "maybe" {
        if(tt.options.every((opt) => opt instanceof MIRTupleType && idx < opt.entries.length && !opt.entries[idx].isOptional)) {
            return "yes";
        }
        else if(tt.options.every((opt) => opt instanceof MIRTupleType && opt.entries.length <= idx)) {
            return "no";
        }
        else {
            return "maybe";
        }
    }

    getMaxTupleLength(tt: MIRType): number {
        const lens = tt.options.map((opt) => (opt as MIRTupleType).entries.length);
        return Math.max(...lens);
    }

    recordHasField(tt: MIRType, pname: string): "yes" | "no" | "maybe" {
        if(tt.options.every((opt) => opt instanceof MIRRecordType && opt.entries.find((entry) => entry.name === pname) !== undefined && !(opt.entries.find((entry) => entry.name === pname) as MIRRecordTypeEntry).isOptional)) {
            return "yes";
        }
        else if(tt.options.every((opt) => opt instanceof MIRRecordType && opt.entries.find((entry) => entry.name === pname) === undefined)) {
            return "no";
        }
        else {
            return "maybe";
        }
    }

    getMaxPropertySet(tt: MIRType): string[] {
        let props = new Set<string>();
        tt.options.forEach((opt) => (opt as MIRRecordType).entries.forEach((entry) => props.add(entry.name)));

        return [...props].sort();
    }

    getEntityEKey(tt: MIRType): MIRNominalTypeKey {
        return (tt.options[0] as MIREntityType).ekey;
    }

    isSpecialReprEntity(tt: MIRType): boolean {
        if (this.typecheckIsName(tt, /^NSCore::None$/) || this.typecheckIsName(tt, /^NSCore::Bool$/) || this.typecheckIsName(tt, /^NSCore::Int$/) || this.typecheckIsName(tt, /^NSCore::String$/)) {
            return true;
        }
        else if (this.typecheckIsName(tt, /^NSCore::SafeString<.*>$/) || this.typecheckIsName(tt, /^NSCore::StringOf<.*>$/)) {
            return true;
        }
        else if (this.typecheckIsName(tt, /^NSCore::GUID$/) || this.typecheckIsName(tt, /^NSCore::LogicalTime$/) || this.typecheckIsName(tt, /^NSCore::DataHash$/) || this.typecheckIsName(tt, /^NSCore::CryptoHash$/)) {
            return true;
        }
        else if (this.typecheckEntityAndProvidesName(tt, this.enumtype) || this.typecheckEntityAndProvidesName(tt, this.idkeytype) || this.typecheckEntityAndProvidesName(tt, this.guididkeytype)
            || this.typecheckEntityAndProvidesName(tt, this.logicaltimeidkeytype) || this.typecheckEntityAndProvidesName(tt, this.contenthashidkeytype)) {
           return true;
        }
        else {
            if (this.typecheckIsName(tt, /^NSCore::Buffer<.*>$/) || this.typecheckIsName(tt, /^NSCore::ISOTime$/) || this.typecheckIsName(tt, /^NSCore::Regex$/)) {
                return true;
            }
            else {
                return false;
            }
        }
    }

    initializeConceptSubtypeRelation(): void {
        this.assembly.conceptDecls.forEach((tt) => {
            const cctype = this.getMIRType(tt.tkey);
            const est = [...this.assembly.entityDecls].map((edecl) => this.getMIRType(edecl[0])).filter((et) => this.assembly.subtypeOf(et, cctype));
            const keyarray = est.map((et) => et.trkey).sort();

            this.conceptSubtypeRelation.set(tt.tkey, keyarray);
        });
    }

    getSubtypesArrayCount(ckey: MIRNominalTypeKey): number {
        return (this.conceptSubtypeRelation.get(ckey) as string[]).length
    }

    generateEntityConstructor(ekey: MIRNominalTypeKey): string {
        return `${this.mangleStringForSMT(ekey)}@cons`;
    }

    generateEntityAccessor(ekey: MIRNominalTypeKey, f: MIRFieldKey): string {
        return `${this.mangleStringForSMT(ekey)}@${this.mangleStringForSMT(f)}`;
    }

    generateConstructorTest(ekey: MIRNominalTypeKey): string {
        return `is-${this.mangleStringForSMT(ekey)}@cons`;
    }

    generateSpecialTypeFieldName(stype: MIRNominalTypeKey, f: string): string {
        return `${this.mangleStringForSMT(stype)}@@${f}`;
    }

    generateSpecialTypeFieldAccess(stype: MIRNominalTypeKey, f: string, arg: string): string {
        return `(${this.generateSpecialTypeFieldName(stype, f)} ${arg})`;
    }

    generateSpecialTypeFieldAccessExp(stype: MIRNominalTypeKey, f: string, arg: string): SMTExp {
        return new SMTValue(`(${this.generateSpecialTypeFieldName(stype, f)} ${arg})`);
    }

    generateEmptyHasArrayFor(ekey: MIRNominalTypeKey): string {
        return this.mangleStringForSMT(`${ekey}_collection_has_array_empty`);
    }

    generateEmptyKeyArrayFor(ekey: MIRNominalTypeKey): string {
        return this.mangleStringForSMT(`${ekey}_collection_key_array_empty`);
    }

    generateEmptyDataArrayFor(ekey: MIRNominalTypeKey): string {
        return this.mangleStringForSMT(`${ekey}_collection_data_array_empty`);
    }

    generateListSMTEntity(entity: MIREntityTypeDecl): { fwddecl: string, fulldecl: string, ocons: string, emptydecl: string } {
        const tt = this.getMIRType(entity.tkey);
        const ename = this.mangleStringForSMT(entity.tkey);

        const typet = entity.terms.get("T") as MIRType;

        const fargs = [
            `(${this.generateSpecialTypeFieldName(entity.tkey, "size")} Int)`,
            `(${this.generateSpecialTypeFieldName(entity.tkey, "entries")} (Array Int ${this.getSMTTypeFor(typet)}))`
        ];

        return {
            fwddecl: `(${ename} 0)`,
            fulldecl: `( (${this.generateEntityConstructor(entity.tkey)} ${fargs.join(" ")}) )`,
            ocons: `(cons@bsq_object_from_${ename} (bsqterm_object_${ename}_value ${this.getSMTTypeFor(tt)}))`,
            emptydecl: `(declare-const ${this.generateEmptyDataArrayFor(entity.tkey)} (Array Int ${this.getSMTTypeFor(typet)}))`
        };
    }

    getKeyListTypeForSet(entity: MIREntityTypeDecl): MIRType {
        const typet = entity.terms.get("T") as MIRType;
        const typekp = this.getKeyProjectedTypeFrom(typet);
        const itypekl = ([...this.assembly.entityDecls].find((e) => e[1].ns === "NSCore" && e[1].name === "KeyList" && (e[1].terms.get("K") as MIRType).trkey === typekp.trkey) as [string, MIREntityTypeDecl])[1];
        const rv = [...this.assembly.typeMap].find((entry) => entry[1].options.length == 2 && entry[1].options[0].trkey === itypekl.tkey && entry[1].options[1].trkey === "NSCore::None");

        return (rv as [string, MIRType])[1];
    }

    generateSetSMTEntity(entity: MIREntityTypeDecl): { fwddecl: string, fulldecl: string, ocons: string, emptydecl: string } {
        const tt = this.getMIRType(entity.tkey);
        const ename = this.mangleStringForSMT(entity.tkey);

        const typet = entity.terms.get("T") as MIRType;
        const typekp = this.getKeyProjectedTypeFrom(typet);
        const typekl = this.getKeyListTypeForSet(entity);

        const fargs =  [
            `(${this.generateSpecialTypeFieldName(entity.tkey, "size")} Int)`,
            `(${this.generateSpecialTypeFieldName(entity.tkey, "has")} (Array ${this.getSMTTypeFor(typekp)} Bool))`,
            `(${this.generateSpecialTypeFieldName(entity.tkey, "values")} (Array ${this.getSMTTypeFor(typekp)} ${this.getSMTTypeFor(typet)}))`,
            `(${this.generateSpecialTypeFieldName(entity.tkey, "keylist")} ${this.getSMTTypeFor(typekl)})`,
        ];

        return {
            fwddecl: `(${ename} 0)`,
            fulldecl: `( (${this.generateEntityConstructor(entity.tkey)} ${fargs.join(" ")}) )`,
            ocons: `(cons@bsq_object_from_${ename} (bsqterm_object_${ename}_value ${this.getSMTTypeFor(tt)}))`,
            emptydecl: [
                `(declare-const ${this.generateEmptyDataArrayFor(entity.tkey)} (Array ${this.getSMTTypeFor(typekp)} ${this.getSMTTypeFor(typet)}))`,
                `(declare-const ${this.generateEmptyHasArrayFor(entity.tkey)} (Array ${this.getSMTTypeFor(typekp)} Bool))`,
                `(assert (= ${this.generateEmptyHasArrayFor(entity.tkey)} ((as const (Array ${this.getSMTTypeFor(typekp)} Bool)) false)))`
            ].join("\n")
        };
    }

    getKeyListTypeForMap(entity: MIREntityTypeDecl): MIRType {
        const typet = entity.terms.get("K") as MIRType;
        const typekp = this.getKeyProjectedTypeFrom(typet);
        const itypekl = ([...this.assembly.entityDecls].find((e) => e[1].ns === "NSCore" && e[1].name === "KeyList" && (e[1].terms.get("K") as MIRType).trkey === typekp.trkey) as [string, MIREntityTypeDecl])[1];
        const rv = [...this.assembly.typeMap].find((entry) => entry[1].options.length == 2 && entry[1].options[0].trkey === itypekl.tkey && entry[1].options[1].trkey === "NSCore::None");

        return (rv as [string, MIRType])[1];
    }

    generateMapSMTEntity(entity: MIREntityTypeDecl): { fwddecl: string, fulldecl: string, ocons: string, emptydecl: string } {
        const tt = this.getMIRType(entity.tkey);
        const ename = this.mangleStringForSMT(entity.tkey);

        const typet = entity.terms.get("K") as MIRType;
        const typeu = entity.terms.get("V") as MIRType;
        const typekp = this.getKeyProjectedTypeFrom(typet);
        const typekl = this.getKeyListTypeForMap(entity);

        const fargs =  [
            `(${this.generateSpecialTypeFieldName(entity.tkey, "size")} Int)`,
            `(${this.generateSpecialTypeFieldName(entity.tkey, "has")} (Array ${this.getSMTTypeFor(typekp)} Bool))`,
            `(${this.generateSpecialTypeFieldName(entity.tkey, "keys")} (Array ${this.getSMTTypeFor(typekp)} ${this.getSMTTypeFor(typet)}))`,
            `(${this.generateSpecialTypeFieldName(entity.tkey, "values")} (Array ${this.getSMTTypeFor(typekp)} ${this.getSMTTypeFor(typeu)}))`,
            `(${this.generateSpecialTypeFieldName(entity.tkey, "keylist")} ${this.getSMTTypeFor(typekl)})`,
        ];

        return {
            fwddecl: `(${ename} 0)`,
            fulldecl: `( (${this.generateEntityConstructor(entity.tkey)} ${fargs.join(" ")}) )`,
            ocons: `(cons@bsq_object_from_${ename} (bsqterm_object_${ename}_value ${this.getSMTTypeFor(tt)}))`,
            emptydecl: [
                `(declare-const ${this.generateEmptyKeyArrayFor(entity.tkey)} (Array ${this.getSMTTypeFor(typekp)} ${this.getSMTTypeFor(typet)}))`,
                `(declare-const ${this.generateEmptyDataArrayFor(entity.tkey)} (Array ${this.getSMTTypeFor(typekp)} ${this.getSMTTypeFor(typeu)}))`,
                `(declare-const ${this.generateEmptyHasArrayFor(entity.tkey)} (Array ${this.getSMTTypeFor(typekp)} Bool))`,
                `(assert (= ${this.generateEmptyHasArrayFor(entity.tkey)} ((as const (Array ${this.getSMTTypeFor(typekp)} Bool)) false)))`
            ].join("\n")
        };
    }

    generateSMTEntity(entity: MIREntityTypeDecl): { fwddecl: string, fulldecl: string, ocons: string, emptydecl?: string } | undefined {
        const tt = this.getMIRType(entity.tkey);

        if (this.isSpecialReprEntity(tt)) {
            return undefined;
        }

        if (this.typecheckIsName(tt, /^NSCore::List<.*>$/)) {
            return this.generateListSMTEntity(entity);
        }
        else if (this.typecheckIsName(tt, /^NSCore::Set<.*>$/)) {
            return this.generateSetSMTEntity(entity);
        }
        else if (this.typecheckIsName(tt, /^NSCore::Map<.*>$/)) {
            return this.generateMapSMTEntity(entity);
        }
        else {
            const fargs = entity.fields.map((fd) => {
                return `(${this.generateEntityAccessor(entity.tkey, fd.fkey)} ${this.getSMTTypeFor(this.getMIRType(fd.declaredType))})`;
            });

            const ename = this.mangleStringForSMT(entity.tkey);
            return {
                fwddecl: `(${ename} 0)`,
                fulldecl: `( (${this.generateEntityConstructor(entity.tkey)} ${fargs.join(" ")}) )`,
                ocons: `(cons@bsq_object_from_${ename} (bsqterm_object_${ename}_value ${this.getSMTTypeFor(tt)}))`
            };
        }
    }

    generateSMTEphemeral(eph: MIREphemeralListType): { fwddecl: string, fulldecl: string } {
        const ename = this.mangleStringForSMT(eph.trkey);
        const aargs: string[] = [];
        for(let i = 0; i < eph.entries.length; ++i ) {
            aargs.push(`(${this.generateEntityAccessor(eph.trkey, `entry_${i}`)} ${this.getSMTTypeFor(eph.entries[i])})`);
        }

        return {
            fwddecl: `(${ename} 0)`,
            fulldecl: `( (${this.generateEntityConstructor(eph.trkey)} ${aargs.join(" ")}) )`
        };
    }

    generateCheckSubtype(ekey: MIRNominalTypeKey, oftype: MIRConceptType): string {
        const lookups = oftype.ckeys.map((ckey) => {
            return `(select MIRConceptSubtypeArray__${this.mangleStringForSMT(ckey)} ${ekey})`;
        });

        if(lookups.length === 1) {
            return lookups[0];
        }
        else {
            return `(or ${lookups.join(" ")})`;
        }
    }
}

export {
    SMTTypeEmitter
};
