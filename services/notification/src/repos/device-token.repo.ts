import { DeviceTokenModel } from "../models/device-token.model.js";

export const deleteDeviceToken = async ( user_id: string ) => {
    try {
        await DeviceTokenModel.deletePushTokenByUserId(user_id);
    }
    catch(error) {
        console.error("deleteDeviceToken Repo error:", error)
    }
}