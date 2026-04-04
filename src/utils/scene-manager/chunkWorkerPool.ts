export interface ChunkWorkerTask {
    resolve: (value: any) => void;
    reject: (reason?: unknown) => void;
    data: any;
    transferables: any[];
}

export function queueChunkWorkerTask(options: {
    workerQueue: ChunkWorkerTask[];
    data: any;
    transferables: any[];
    processQueue: () => void;
}) {
    const { workerQueue, data, transferables, processQueue } = options;
    return new Promise((resolve, reject) => {
        workerQueue.push({ resolve, reject, data, transferables });
        processQueue();
    });
}

export function processChunkWorkerQueue(options: {
    activeWorkerCount: number;
    maxWorkers: number;
    workerQueue: ChunkWorkerTask[];
    workers: Worker[];
    createWorker: () => Worker;
    getActiveWorkerCount: () => number;
    onActiveWorkerCountChange: (count: number) => void;
    processQueue: () => void;
}) {
    const {
        activeWorkerCount,
        maxWorkers,
        workerQueue,
        workers,
        createWorker,
        getActiveWorkerCount,
        onActiveWorkerCountChange,
        processQueue
    } = options;

    if (activeWorkerCount >= maxWorkers || workerQueue.length === 0) {
        return;
    }

    const task = workerQueue.shift()!;
    onActiveWorkerCountChange(activeWorkerCount + 1);

    const worker = workers.pop() ?? createWorker();

    const onMessage = (event: MessageEvent) => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        workers.push(worker);
        onActiveWorkerCountChange(Math.max(0, getActiveWorkerCount() - 1));

        if (event.data.type === "success") {
            task.resolve(event.data.result);
        } else {
            task.reject(new Error(event.data.error));
        }
        processQueue();
    };

    const onError = (event: ErrorEvent) => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        onActiveWorkerCountChange(Math.max(0, getActiveWorkerCount() - 1));
        task.reject(new Error(event.message));
        processQueue();
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(task.data, task.transferables);
}

export function disposeChunkWorkerPool(options: {
    workers: Worker[];
    workerQueue: ChunkWorkerTask[];
    rejectReason: string;
}) {
    const { workers, workerQueue, rejectReason } = options;

    for (const worker of workers) {
        try {
            worker.terminate();
        } catch (error) {
            console.warn("Worker terminate failed:", error);
        }
    }

    if (workerQueue.length > 0) {
        const pending = workerQueue.splice(0, workerQueue.length);
        pending.forEach((task) => task.reject(new Error(rejectReason)));
    }
}
