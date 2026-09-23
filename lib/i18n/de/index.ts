/**
 * German, merged from one file per area of the platform so each can be
 * written and reviewed on its own. Keys are the exact English strings in the
 * code, placeholders included ("{n} open points").
 */
import common from "./common";
import hospital from "./hospital";
import products from "./products";
import review from "./review";
import supplier from "./supplier";
import admin from "./admin";
import messages from "./messages";
import server from "./server";

export const DE: Record<string, string> = {
  ...common, ...hospital, ...products, ...review, ...supplier, ...admin, ...messages, ...server,
};
