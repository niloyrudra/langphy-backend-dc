import type { Request, Response } from "express";
import { Category } from "../models/category.model.js";
// import mongoose from "mongoose";

// GET all categories
export const getCategories = async ( _req: Request, res: Response ) => {
    try {
        const categories = await Category.find({})
                                    .sort({ position_at: 1 }) // ASC
                                    .lean();
        if (!categories) {
            return res.status(404).json({ message: "Categories not found!" });
        }

        res.status(200).json(categories);
    }
    catch( err ) {
        console.error( "Category fetching error:", err );
        res.status(500).json({
            error: "Failed to fetch categoires!"
        });
    }
};

// Optionally: GET single category
export const getCategoryById = async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id || typeof id !== "string") {
        return res.status(400).json({ message: "Invalid Category ID!" });
    }

    try {
        const category = await Category.findOne({ _id: id }).lean();

        if (!category) {
            return res.status(404).json({ message: "Category not found!" });
        }

        return res.status(200).json(category);
    } catch (err) {
        console.error("Get category by id error:", err);
        return res.status(500).json({ message: "Category Service - Server error." });
    }
};