import { entries } from "@fern-api/core-utils";
import { TaskContext } from "@fern-api/task-context";
import { Fiddle } from "@fern-fern/fiddle-client-v2";
import { RemoteTaskHandler } from "./RemoteTaskHandler";
import { REMOTE_GENERATION_SERVICE } from "./service";
import { GenericGeneratorInvocationSchema } from "./types";

const MAX_UNSUCCESSFUL_ATTEMPTS = 3;

export function pollJobAndReportStatus({
    job,
    genericGeneratorInvocations,
    context,
}: {
    job: Fiddle.remoteGen.CreateJobResponse;
    genericGeneratorInvocations: GenericGeneratorInvocationSchema[];
    context: TaskContext;
}): Promise<void> {
    let numConsecutiveFailed = 0;
    const taskHandlers = job.taskIds.reduce<Record<Fiddle.remoteGen.RemoteGenTaskId, RemoteTaskHandler>>(
        (acc, taskId, index) => {
            const generatorInvocation = genericGeneratorInvocations[index];
            if (generatorInvocation == null) {
                context.fail("Task IDs list is longer than generators list.");
            } else {
                const interactiveTaskContext = context
                    .addInteractiveTask({
                        name: generatorInvocation.name,
                    })
                    .start();
                interactiveTaskContext.logger.debug(`Task ID: ${taskId}`);
                acc[taskId] = new RemoteTaskHandler({
                    job,
                    taskId,
                    generatorInvocation,
                    interactiveTaskContext,
                });
            }
            return acc;
        },
        {}
    );

    return new Promise((resolve) => {
        void pollForStatus();

        async function pollForStatus() {
            const response = await fetchJobStatus(job);
            context.logger.debug("Received status update: " + JSON.stringify(response));
            if (response == null || !response.ok) {
                numConsecutiveFailed++;
                if (numConsecutiveFailed === MAX_UNSUCCESSFUL_ATTEMPTS) {
                    context.fail("Failed to poll task status.");
                    return resolve();
                }
            } else {
                for (const [taskId, taskUpdate] of entries(response.body)) {
                    taskHandlers[taskId]?.processUpdate(taskUpdate);
                }
                const allFinished = Object.values(taskHandlers).every((taskHandler) => taskHandler.isFinished());
                if (allFinished) {
                    return resolve();
                }
            }

            setTimeout(pollForStatus, 2_000);
        }
    });
}

async function fetchJobStatus(job: Fiddle.remoteGen.CreateJobResponse) {
    try {
        return await REMOTE_GENERATION_SERVICE.remoteGen.getJobStatus({
            jobId: job.jobId,
        });
    } catch (error) {
        return undefined;
    }
}
