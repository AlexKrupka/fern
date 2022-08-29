import { TaskContext } from "@fern-api/task-context";
import { Workspace } from "@fern-api/workspace-loader";
import { Fiddle } from "@fern-fern/fiddle-client-v2";
import { IntermediateRepresentation } from "@fern-fern/ir-model/ir";
import { createAndStartJob } from "./createAndStartJob";
import { pollJobAndReportStatus } from "./pollJobAndReportStatus";
import { GenericGeneratorInvocationSchema } from "./types";

export async function runRemoteGenerationForWorkspace({
    organization,
    workspace,
    intermediateRepresentation,
    context,
    generatorConfigs,
    genericGeneratorInvocations,
    version,
}: {
    organization: string;
    workspace: Workspace;
    intermediateRepresentation: IntermediateRepresentation;
    context: TaskContext;
    generatorConfigs: Fiddle.remoteGen.GeneratorConfig[];
    genericGeneratorInvocations: GenericGeneratorInvocationSchema[];
    version: string | undefined;
}): Promise<void> {
    if (generatorConfigs.length === 0) {
        context.logger.warn("No generators specified.");
        return;
    }

    let job: Fiddle.remoteGen.CreateJobResponse;
    try {
        job = await createAndStartJob({
            workspace,
            organization,
            intermediateRepresentation,
            generatorConfigs,
            version,
        });
    } catch (error) {
        context.fail("Failed to create job", error);
        return;
    }

    await pollJobAndReportStatus({
        job,
        genericGeneratorInvocations,
        context,
    });
}
