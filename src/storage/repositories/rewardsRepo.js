// src/storage/repositories/rewardsRepo.js
// Catálogo de recompensas (global) no IndexedDB

import { STORE_REWARDS } from "../../app/constants.js";
import { withTx, reqToPromise } from "../db.js";

export async function getReward(db, rewardId) {
  return withTx(db, [STORE_REWARDS], "readonly", async (_tx, stores) => {
    return reqToPromise(stores[STORE_REWARDS].get(rewardId));
  });
}

export async function upsertReward(db, reward) {
  if (!reward?.id) throw new Error("upsertReward: reward.id é obrigatório");

  return withTx(db, [STORE_REWARDS], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_REWARDS].put(reward));
    return reward;
  });
}

export async function bulkUpsertRewards(db, rewards) {
  const arr = Array.isArray(rewards) ? rewards : [];
  return withTx(db, [STORE_REWARDS], "readwrite", async (_tx, stores) => {
    const s = stores[STORE_REWARDS];
    for (const r of arr) {
      if (!r?.id) continue;
      await reqToPromise(s.put(r));
    }
  });
}

export async function deleteReward(db, rewardId) {
  return withTx(db, [STORE_REWARDS], "readwrite", async (_tx, stores) => {
    await reqToPromise(stores[STORE_REWARDS].delete(rewardId));
  });
}

export async function listRewards(db) {
  return withTx(db, [STORE_REWARDS], "readonly", async (_tx, stores) => {
    const s = stores[STORE_REWARDS];
    const all = await reqToPromise(s.getAll());
    // ordena por custo (crescente)
    return (all || []).slice().sort((a, b) => (a.cost || 0) - (b.cost || 0));
  });
}
