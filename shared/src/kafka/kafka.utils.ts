export const connectWithRetry = async (consumer: any, serviceName: string) => {
    let connected = false;
    while (!connected) {
        try {
            await consumer.connect();
            console.log(`[${serviceName}] ✅ Kafka Consumer Connected`);
            connected = true;
        } catch (err) {
            console.error(`[${serviceName}] ❌ Kafka Connection failed, retrying in 5s...`, err);
            await new Promise(res => setTimeout(res, 3000));
        }
    }
};