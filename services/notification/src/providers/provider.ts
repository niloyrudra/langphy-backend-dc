export interface PushResult {
    successCount: number;
    failureCount: number;
    invalidTokens: string[];
}

export interface PushProvider {
    send(
        tokens: string[],
        payload: {
            title: string,
            bosy: string,
            data: Record<string, any>
        }
    ): Promise<PushResult>
};