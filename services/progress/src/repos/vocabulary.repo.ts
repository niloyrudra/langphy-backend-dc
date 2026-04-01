import { VocabularyModel, type VocabularyWord } from "../models/vocabulary.model.js";

export class VocabularyRepo {

    static async syncWords(userId: string, words: VocabularyWord[]) {
        try {
            const inserted = await VocabularyModel.bulkUpsert(userId, words);
            return { inserted };
        } catch (error) {
            console.error("VocabularyRepo syncWords error:", error);
            return { inserted: 0 };
        }
    }

    static async getCount(userId: string): Promise<number> {
        return await VocabularyModel.getCountByUser(userId);
    }

    static async deleteByUser(userId: string) {
        return await VocabularyModel.deleteByUserId(userId);
    }
}