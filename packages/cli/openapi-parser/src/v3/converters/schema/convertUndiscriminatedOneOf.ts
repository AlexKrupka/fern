import { SchemaWithExample } from "@fern-fern/openapi-ir-model/parseIr";
import { difference } from "lodash-es";
import { OpenAPIV3 } from "openapi-types";
import { AbstractOpenAPIV3ParserContext } from "../../AbstractOpenAPIV3ParserContext";
import { isReferenceObject } from "../../utils/isReferenceObject";
import { isSchemaEqual } from "../../utils/isSchemaEqual";
import { convertSchema } from "../convertSchemas";
import { convertEnum, convertNumberToSnakeCase } from "./convertEnum";

export function convertUndiscriminatedOneOf({
    nameOverride,
    generatedName,
    breadcrumbs,
    description,
    wrapAsNullable,
    context,
    subtypes,
}: {
    nameOverride: string | undefined;
    generatedName: string;
    breadcrumbs: string[];
    description: string | undefined;
    wrapAsNullable: boolean;
    context: AbstractOpenAPIV3ParserContext;
    subtypes: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[];
}): SchemaWithExample {
    const subtypePrefixes = getUniqueSubTypeNames({ schemas: subtypes });

    const convertedSubtypes = subtypes.map((schema, index) => {
        return convertSchema(schema, false, context, [...breadcrumbs, subtypePrefixes[index] ?? `${index}`]);
    });

    const uniqueSubtypes: SchemaWithExample[] = [];
    for (let i = 0; i < convertedSubtypes.length; ++i) {
        const a = convertedSubtypes[i];
        let isDuplicate = false;
        for (let j = i + 1; j < convertedSubtypes.length; ++j) {
            const b = convertedSubtypes[j];
            if (a != null && b != null && isSchemaEqual(a, b)) {
                isDuplicate = true;
                break;
            }
        }
        if (a != null && !isDuplicate) {
            uniqueSubtypes.push(a);
        }
    }

    const everySubTypeIsLiteral = Object.entries(uniqueSubtypes).every(([_, schema]) => {
        return schema.type === "literal";
    });
    if (everySubTypeIsLiteral) {
        const enumDescriptions: Record<string, { description: string }> = {};
        const enumValues: string[] = [];
        Object.entries(uniqueSubtypes).forEach(([_, schema]) => {
            if (schema.type === "literal") {
                enumValues.push(schema.value);
                if (schema.description != null) {
                    enumDescriptions[schema.value] = {
                        description: schema.description,
                    };
                }
            }
        });
        return convertEnum({
            nameOverride,
            generatedName,
            wrapAsNullable,
            description,
            fernEnum: enumDescriptions,
            enumVarNames: undefined,
            enumValues,
        });
    }

    if (uniqueSubtypes.length === 1 && uniqueSubtypes[0] != null) {
        return uniqueSubtypes[0];
    }

    return wrapUndiscriminantedOneOf({
        nameOverride,
        generatedName,
        wrapAsNullable,
        description,
        subtypes: uniqueSubtypes,
    });
}

function getUniqueSubTypeNames({
    schemas,
}: {
    schemas: (OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject)[];
}): string[] {
    // computes the unique properties for each object sub type
    let uniquePropertySets: Record<string, string[]> = {};
    let index = 0;
    for (const schema of schemas) {
        if (isReferenceObject(schema)) {
            // pass
        } else if (schema.properties != null && Object.entries(schema.properties).length > 0) {
            const schemaProperties = Object.keys(schema.properties);
            const updatedPropertySets: Record<string, string[]> = {};
            let uniqueSchemaProperties = schemaProperties;
            for (const [key, uniquePropertySet] of Object.entries(uniquePropertySets)) {
                const updatedSet = difference(uniquePropertySet, schemaProperties);
                uniqueSchemaProperties = difference(uniqueSchemaProperties, uniquePropertySet);
                updatedPropertySets[key] = updatedSet;
            }
            updatedPropertySets[index] = uniqueSchemaProperties;
            uniquePropertySets = updatedPropertySets;
        }
        index++;
    }

    // generates prefix for subtype
    const prefixes = [];
    let i = 0;
    for (const schema of schemas) {
        const propertySet = uniquePropertySets[i];
        if (propertySet != null && propertySet.length > 0) {
            const sortedProperties = propertySet.sort();
            if (sortedProperties[0] != null) {
                prefixes.push(sortedProperties[0]);
                ++i;
                continue;
            }
        }

        if (isReferenceObject(schema)) {
            prefixes.push(convertNumberToSnakeCase(i) ?? `${i}`);
        } else if (
            schema.type === "array" ||
            schema.type === "boolean" ||
            schema.type === "integer" ||
            schema.type === "number" ||
            schema.type === "string"
        ) {
            prefixes.push("");
        } else {
            prefixes.push(convertNumberToSnakeCase(i) ?? `${i}`);
        }
        ++i;
    }
    return prefixes;
}

export function wrapUndiscriminantedOneOf({
    nameOverride,
    generatedName,
    wrapAsNullable,
    description,
    subtypes,
}: {
    wrapAsNullable: boolean;
    nameOverride: string | undefined;
    generatedName: string;
    description: string | undefined;
    subtypes: SchemaWithExample[];
}): SchemaWithExample {
    if (wrapAsNullable) {
        return SchemaWithExample.nullable({
            value: SchemaWithExample.oneOf({
                type: "undisciminated",
                description,
                nameOverride,
                generatedName,
                schemas: subtypes,
            }),
            description,
        });
    }
    return SchemaWithExample.oneOf({
        type: "undisciminated",
        description,
        nameOverride,
        generatedName,
        schemas: subtypes,
    });
}
