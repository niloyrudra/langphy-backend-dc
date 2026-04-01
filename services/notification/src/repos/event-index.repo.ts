import { EventIndexModel } from "../models/eventIndex.model.js";

export const deleteEventIndex = async ( user_id: string ) => {
    try {
        await EventIndexModel.clearProcessed( user_id );
    }
    catch(error) {
        console.error("deleteEventIndex Repo error:", error)
    }
}