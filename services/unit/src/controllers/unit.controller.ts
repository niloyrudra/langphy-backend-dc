import type { Request, Response } from "express";
import { Unit } from "../models/unit.model.js";

// Get All units
export const getUnits = async ( _req: Request, res: Response ) => {
    try {
        const units = await Unit.find({})
                                    .sort({ title: 1 })
                                    .lean();
        
        if (!units) {
            return res.status(404).json({ message: "Units not found!" });
        }

        res.status(200).json( units );
    }
    catch(err) {
        console.error( "Units fetching error:", err );
        res.status(500).json({
            error: "Failed to fetch units!"
        });
    }
};

export const getUnitsByCategoryId = async ( req: Request, res: Response ) => {
    const { categoryId } = req.params;

    if( !categoryId || typeof categoryId !== 'string' ) {
        return res.status(400).json({
            message: "Invalid Category Id!"
        });
    }

    try {
        const units = await Unit.find({categoryId})
                                    .sort({ title: 1 })
                                    .lean();
    
        if ( !units ) {
            return res.status(404).json({ message: "Units not found!" });
        }

        res.status(200).json( units );
    }
    catch(err) {
        console.error( "Get units by id error:", err );
        res.status(500).json({
            error: "Failed to fetch units by category id!"
        });
    }
};