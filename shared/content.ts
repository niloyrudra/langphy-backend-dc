/**
 * Content-service kit — shared by the MongoDB content services
 * (`category`, `unit`, `practice`, `quiz`, `speaking`, `reading`, `writing`,
 * `listening`).
 *
 * A content service is intentionally small:
 *
 *   src/models/<resource>.model.ts    →  createContentModel(...) with service schema fields
 *   src/config.ts                     →  loadContentConfig(...)
 *   src/controllers/<name>.controller.ts → createContentControllers(...)
 *   src/routes/<name>.route.ts        →  createContentRouter(...)
 *   src/db/index.ts                   →  re-export connectMongo(...)
 *   src/index.ts                      →  bootstrapContentService(...)
 *
 * This module is standalone by design: it has NO zod/kafka coupling so the
 * content services (pure GET HTTP servers) never pull in Kafka/zod runtime code.
 */
import express, {
    type Application,
    type NextFunction,
    type Request,
    type RequestHandler,
    type Response,
    type Router,
} from "express";
import "express-async-errors"; // routes may be async; rejections → error handler
import cors from "cors";
import mongoose, { Schema, model, type InferSchemaType, type Model, type SchemaDefinition } from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentConfig {
    /** Current content version exposed to clients (default: 1). */
    version: number;
    /** Active collection name (default: `defaultCollection`). */
    collection: string;
}

export interface LoadContentConfigOptions {
    /** Env var holding the CONTENT_VERSION integer (e.g. "CATEGORY_CONTENT_VERSION"). */
    versionEnv: string;
    /** Env var holding the active collection name (e.g. "CATEGORY_COLLECTION"). */
    collectionEnv: string;
    /** Collection used when the env var is unset (e.g. "categories"). */
    defaultCollection: string;
    /** Version used when the env var is unset (default: 1). */
    defaultVersion?: number;
}

/**
 * Read the content-version + active-collection pair from the environment at
 * boot. Drives the Mongoose collection (the version boundary) and the
 * `/version` endpoint / `X-Content-Version` header.
 */
export function loadContentConfig(opts: LoadContentConfigOptions): ContentConfig {
    const defaultVersion = opts.defaultVersion ?? 1;

    const raw = process.env[opts.versionEnv];
    const version = raw === undefined || raw === "" ? defaultVersion : Number.parseInt(raw, 10);
    const versionOrDefault = Number.isNaN(version) ? defaultVersion : version;

    return {
        version: versionOrDefault,
        collection: process.env[opts.collectionEnv] || opts.defaultCollection,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// MongoDB connection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Connect to the service's MongoDB. Throws if `envVar` is unset or the
 * connection fails, so the caller can decide whether to exit.
 */
export async function connectMongo(envVar: string, label: string): Promise<void> {
    const uri = process.env[envVar];
    if (!uri) {
        throw new Error(`${envVar} not defined!`);
    }
    await mongoose.connect(uri);
    console.log(`Connected to ${label} MongoDB!`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Model factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a typed Mongoose model bound to the env-driven active collection.
 * Keep the unique schema fields in `fields`; the collection pointer and the
 * `InferSchemaType`/`model<>` wrapper boilerplate live here.
 */
export function createContentModel<TSchema extends Schema = Schema>(opts: {
    modelName: string;
    collectionEnv: string;
    defaultCollection: string;
    fields: SchemaDefinition;
    timestamps?: boolean;
}): Model<InferSchemaType<TSchema>> {
    const collection = process.env[opts.collectionEnv] || opts.defaultCollection;
    const schema = new Schema(opts.fields, {
        collection,
        timestamps: opts.timestamps ?? false,
    }) as TSchema;
    return model<InferSchemaType<TSchema>>(opts.modelName, schema);
}

// ─────────────────────────────────────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────────────────────────────────────

export interface ContentControllerOptions {
    /** The service model (from `createContentModel`). */
    model: Model<any>;
    /** Resource name used in /version + error messages (e.g. "category"). */
    resource: string;
    /** Runtime content config (from `loadContentConfig`). */
    config: ContentConfig;
    /** Optional sort for the “get all” query — `{ position_at: 1 }` for category. */
    sort?: Record<string, 1 | -1>;
    /** Param key(s) used by the “by key(s)” route (e.g. ["categoryId","unitId"]). */
    paramKeys?: string[];
    /**
     * If true the by-key route uses `findOne` and returns a single doc
     * (category's `GET /api/category/:id` behavior). Default: false → array.
     */
    single?: boolean;
    /** Label strings used in errors (overrides defaults derived from `resource`). */
    messages?: {
        /** Shown when the “get all” query returns zero docs. */
        notFound?: string;
        /** Shown when a filter param is missing. */
        invalidParam?: string;
        /** Shown on internal errors. */
        serverError?: string;
    };
}

export interface ContentControllers {
    getVersion: RequestHandler;
    getAll: RequestHandler;
    getByKey: RequestHandler;
}

/**
 * Build the three standard content routes. Preserves current behavior:
 * - version route → `{ resource, version }`
 * - data routes → set `X-Content-Version`, return docs (404 on empty)
 * - `getByKey` supports both `/:categoryId` and `/:categoryId/:unitId`
 */
export function createContentControllers(opts: ContentControllerOptions): ContentControllers {
    const { model, resource, config, sort, paramKeys, messages, single } = opts;
    const notFound = messages?.notFound ?? `${capitalize(resource)}s not found!`;
    const invalidParam = messages?.invalidParam ?? "Invalid id!";
    const serverError = messages?.serverError ?? `Failed to fetch ${resource}s!`;

    const getVersion: RequestHandler = (_req, res) => {
        res.status(200).json({ resource, version: config.version });
    };

    const getAll: RequestHandler = async (_req, res) => {
        try {
            let query = model.find({});
            if (sort) query = query.sort(sort);
            const docs = await query.lean();
            if (docs.length === 0) {
                return res.status(404).json({ message: notFound });
            }
            res.setHeader("X-Content-Version", String(config.version));
            res.status(200).json(docs);
        } catch (err) {
            console.error(`${capitalize(resource)} fetching error:`, err);
            res.status(500).json({ error: serverError });
        }
    };

    const getByKey: RequestHandler = async (req, res) => {
        const keys = paramKeys ?? ["id"];
        const filter: Record<string, unknown> = {};
        for (const key of keys) {
            const raw = req.params[key];
            // Express types can widen params to string | string[]; a named
            // param is always a single string, so unwrap defensively.
            const value = Array.isArray(raw) ? raw[0] : raw;
            if (!value) {
                return res.status(400).json({ message: `${invalidParam} (${key})` });
            }
            // The "id" route param maps to the document _id field.
            const field = key === "id" ? "_id" : key;
            // ObjectId-backed _id: reject non-ObjectId values up front so
            // mongoose never throws a CastError (invalid id → 404, never 500).
            if (field === "_id" && !mongoose.Types.ObjectId.isValid(value)) {
                return res.status(404).json({ message: notFound });
            }
            filter[field] = value;
        }
        try {
            if (single) {
                const doc = await model.findOne(filter).lean();
                if (!doc) {
                    return res.status(404).json({ message: notFound });
                }
                res.setHeader("X-Content-Version", String(config.version));
                return res.status(200).json(doc);
            }

            let query = model.find(filter);
            if (sort) query = query.sort(sort);
            const docs = await query.lean();
            if (docs.length === 0) {
                return res.status(404).json({ message: notFound });
            }
            res.setHeader("X-Content-Version", String(config.version));
            res.status(200).json(docs);
        } catch (err) {
            console.error(`Get ${resource} by ids error:`, err);
            res.status(500).json({ message: `${serverError}` });
        }
    };

    return { getVersion, getAll, getByKey };
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateContentRouterOptions {
    /** Public base path, e.g. "/api/category". */
    basePath: string;
    /** The three controllers from `createContentControllers`. */
    controllers: ContentControllers;
    /**
     * Param route suffix registered after `basePath` for `getByKey`.
     * Default: "/:categoryId/:unitId?" — category overrides with "/:id".
     */
    paramRoute?: string;
}

/**
 * Build the content router. ⚠️ `/version` MUST be registered before the param
 * route(s), otherwise string ids swallow it.
 */
export function createContentRouter(opts: CreateContentRouterOptions): Router {
    const router = express.Router();
    const { basePath, controllers, paramRoute } = opts;
    const paramSuffix = paramRoute ?? "/:categoryId/:unitId";
    router.get(`${basePath}/version`, controllers.getVersion);
    router.get(basePath, controllers.getAll);
    router.get(`${basePath}${paramSuffix}`, controllers.getByKey);
    return router;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error handler
// ─────────────────────────────────────────────────────────────────────────────

export interface ErrorHandlerOptions {
    /** Used in the log prefix (default: "Content Service"). */
    serviceLabel?: string;
}

/** Standard 500 JSON error handler. */
export function createErrorHandler(opts: ErrorHandlerOptions = {}): (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
) => void {
    const label = opts.serviceLabel ?? "Content Service";
    return (err, _req, res, _next) => {
        console.error(`${label} error:`, err);
        res.status(500).json({ error: "Internal server error!" });
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

export interface BootstrapContentServiceOptions {
    /** Service router (built via `createContentRouter`). */
    router: Router;
    /** Env var with the Mongo URI (e.g. "CATEGORY_MONGO_URI"). */
    mongoEnvVar: string;
    /** Human label for the service (e.g. "Category"). */
    serviceName: string;
    /** Port used when `PORT` env is unset (e.g. 4000). */
    defaultPort: number;
    /** Label passed to `connectMongo` (defaults to `serviceName`). */
    mongoLabel?: string;
    /** Enables CORS (default: false — matches category/unit/quiz). */
    enableCors?: boolean;
    /** Response body for the JSON 404 catch-all (default: `{ error: "Route not found!" }`). */
    notFoundBody?: unknown;
}

/**
 * Bootstrap a content service:
 *  1. JSON body parser + router
 *  2. JSON 404 catch-all
 *  3. error-handler middleware
 *  4. awaited `connectMongo()` → `process.exit(1)` on boot failure
 *  5. listen on PORT (default `defaultPort`), all interfaces
 */
export async function bootstrapContentService(opts: BootstrapContentServiceOptions): Promise<void> {
    const {
        router,
        mongoEnvVar,
        serviceName,
        defaultPort,
        mongoLabel,
        enableCors,
        notFoundBody,
    } = opts;

    const app: Application = express();
    app.use(express.json());
    if (enableCors) app.use(cors());
    app.use(router);
    app.all("*", (_req, res) => {
        res.status(404).json(notFoundBody ?? { error: "Route not found!" });
    });
    app.use(createErrorHandler({ serviceLabel: serviceName }));

    const label = mongoLabel ?? serviceName;
    try {
        await connectMongo(mongoEnvVar, label);
    } catch (err) {
        console.error(`Failed to connect to ${label} MongoDB:`, err);
        process.exit(1);
    }

    const port: number = parseInt(process.env.PORT || String(defaultPort), 10);
    app.listen(port, "::", () => {
        console.log(`${serviceName} service listening on port ${port}.`);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}