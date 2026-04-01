CREATE TABLE IF NOT EXISTS lp_vocabulary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    word TEXT NOT NULL,
    lemma TEXT NOT NULL,
    pos TEXT NOT NULL,
    meaning_en TEXT,
    unit_id TEXT,
    category_id TEXT,
    learned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    UNIQUE (user_id, lemma)
);

CREATE INDEX IF NOT EXISTS idx_vocabulary_user_id ON lp_vocabulary (user_id);

CREATE TRIGGER trg_vocabulary_learned_at
BEFORE UPDATE ON lp_vocabulary
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();