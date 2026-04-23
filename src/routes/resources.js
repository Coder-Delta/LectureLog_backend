import { Router } from "express";
import tryCatch from "../utils/tryCatch.js";
import { assertRequired } from "../utils/validators.js";
import { created, ok } from "../utils/respond.js";
import {
  createItem,
  deleteItemById,
  getItemById,
  listItems,
  updateItemById
} from "../services/crudService.js";

const makeResourceRouter = ({ label, collection, createFields }) => {
  const router = Router();

  router.post(
    "/",
    tryCatch(async (req, res) => {
      assertRequired(req.body, createFields);
      const item = createItem(collection, req.body);
      return created(res, `${label} created`, item);
    })
  );

  router.get(
    "/",
    tryCatch(async (_req, res) => ok(res, `${label} list fetched`, listItems(collection)))
  );

  router.get(
    "/:id",
    tryCatch(async (req, res) =>
      ok(res, `${label} fetched`, getItemById(collection, req.params.id, label))
    )
  );

  router.put(
    "/:id",
    tryCatch(async (req, res) =>
      ok(res, `${label} updated`, updateItemById(collection, req.params.id, req.body, label))
    )
  );

  router.delete(
    "/:id",
    tryCatch(async (req, res) =>
      ok(res, `${label} deleted`, deleteItemById(collection, req.params.id, label))
    )
  );

  return router;
};

export default makeResourceRouter;
