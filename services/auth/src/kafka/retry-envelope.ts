export interface RetryEnvelope {
  original_event: any;
  error: string;
  retry_count: number;
  last_failed_at: string;
}