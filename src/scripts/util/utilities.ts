import async from "async";
import axios from "axios";
import _ from "lodash";
import awtools from "../../assets/awtools.json";
import awlands from "../../assets/awlands.json";
import "../../style/builder.less";
import {
	AccountBagResponse,
	AccountInfoItem,
	AccountInfoResponse,
	AccountMinersResponse,
	AssetInfoResponse,
	BalanceItem,
	CacheObject,
	InventoryAssetItem,
	InventoryAssetsResponse,
	InventoryTemplateItem,
	InventoryTemplatesResponse,
	LandItem,
	MineHistoryItem,
	MineHistoryResponse,
	ToolItem,
} from "../types/types";

export async function fetchToolAsset(asset: string): Promise<ToolItem> {
	const key = `asset_${asset}`;
	const cache = getStorageItem<ToolItem>(key);
	if (cache) {
		return cache;
	}
	const url = `https://wax.api.atomicassets.io/atomicassets/v1/assets/${asset}`;
	const response = await axios.get<AssetInfoResponse>(url, { timeout: 10e3 });

	const tool = findTool(response?.data?.data?.template.template_id, asset);
	setStorageItem(key, tool, 3600);
	return tool;
}

export async function getInventoryTemplates(account: string): Promise<InventoryTemplateItem[]> {
	const key = `inventory_templates_${account}`;
	const cache = getStorageItem<InventoryTemplateItem[]>(key);
	if (cache) {
		return cache;
	}

	const url = `https://wax.api.atomicassets.io/atomicassets/v1/accounts/${account}/alien.worlds`;
	const response = await axios.get<InventoryTemplatesResponse>(url, { timeout: 10e3 });

	const templates = response?.data?.data?.templates?.map(t => ({
		template: t.template_id,
		count: parseInt(t.assets),
	}));

	setStorageItem(key, templates, 300);
	return templates;
}

export async function getInventoryAssets(account: string): Promise<InventoryAssetItem[]> {
	const key = `inventory_assets_${account}`;
	const cache = getStorageItem<InventoryAssetItem[]>(key);
	if (cache) {
		return cache;
	}

	const url = `https://wax.api.atomicassets.io/atomicassets/v1/assets`;
	const response = await axios.get<InventoryAssetsResponse>(url, {
		params: {
			owner: account,
			collection_name: "alien.worlds",
			schema_name: "tool.worlds",
			page: 1,
			limit: 500,
			order: "desc",
			sort: "transferred",
		},
		timeout: 10e3,
	});

	const assets = response?.data?.data?.map(a => ({
		asset: a.asset_id,
		template: a.template.template_id,
	}));
	setStorageItem(key, assets, 300);
	return assets;
}

export function findTool(template: string, asset?: string): ToolItem {
	for (let i = 0; i < awtools.length; i++) {
		if (awtools[i].template === template) {
			return { ...awtools[i], asset };
		}
	}
	return null;
}

export function findLand(asset?: string): LandItem {
	for (let i = 0; i < awlands.length; i++) {
		if (awlands[i].asset === asset) {
			return awlands[i];
		}
	}
	return null;
}

export function calculateToolsPower(tools: ToolItem[]): number {
	return _(tools).sumBy(t => t.power);
}

export function calculateToolsLuck(tools: ToolItem[]): number {
	return _(tools).sumBy(t => t.luck);
}

export function calculateToolsDelay(tools: ToolItem[]): number {
	const delays = _(tools)
		.map(t => t.delay)
		.value();
	switch (delays.length) {
		case 1:
			return _.sum(delays);
		case 2:
			return _.sum(delays) - Math.floor(_.min(delays) / 2);
		case 3:
			return _.sum(delays) - _.min(delays);
	}

	return _.sum(delays) - _.min(delays);
}

export async function fetchMineHistory(account: string): Promise<MineHistoryItem[]> {
	const key = `history_${account}`;
	const cache = getStorageItem<MineHistoryItem[]>(key);
	if (cache) {
		return cache;
	}

	const url = `https://api.waxsweden.org/v2/history/get_actions`;
	const response = await axios.get<MineHistoryResponse>(url, {
		params: {
			"account": account,
			"skip": 0,
			"limit": 100,
			"sort": "desc",
			"transfer.to": account,
			"transfer.from": "m.federation",
		},
		timeout: 10e3,
	});

	const history = response?.data?.actions
		?.filter(m => m.act.name === "transfer")
		?.map(m => ({
			date: new Date(`${m.timestamp}Z`),
			amount: m?.act?.data?.amount,
		}));
	setStorageItem(key, history, 120);
	return history;
}

export async function fetchTokenBalance(code: string, account: string, symbol: string): Promise<number> {
	const url = `https://wax.greymass.com/v1/chain/get_currency_balance`;
	const response = await axios.post<string[]>(url, { code, account, symbol }, { timeout: 10e3 });

	return parseFloat(response?.data?.pop());
}

export async function fetchAccountInfo(account: string): Promise<AccountInfoItem> {
	const key = `info_${account}`;
	const cache = getStorageItem<AccountInfoItem>(key);
	if (cache) {
		return cache;
	}

	const url = `https://wax.pink.gg/v1/chain/get_account`;
	const response = await axios.post<AccountInfoResponse>(url, { account_name: account }, { timeout: 10e3 });

	const info = {
		created: new Date(response?.data?.created),
		cpu: {
			total: response?.data?.cpu_limit?.max,
			used: response?.data?.cpu_limit?.used,
			staked: parseInt(response?.data?.cpu_weight, 10) / 1e8,
		},
		ram: {
			total: response?.data?.ram_quota,
			used: response?.data?.ram_usage,
		},
		net: {
			total: response?.data?.net_limit?.max,
			used: response?.data?.net_limit?.used,
			staked: response?.data?.net_weight / 1e8,
		},
	};
	setStorageItem(key, info, 60);
	return info;
}

export async function fetchBalances(account: string): Promise<BalanceItem> {
	const key = `balances_${account}`;
	const cache = getStorageItem<BalanceItem>(key);
	if (cache) {
		return cache;
	}

	const [wax, tlm] = await Promise.all([fetchTokenBalance("eosio.token", account, "WAX"), fetchTokenBalance("alien.worlds", account, "TLM")]);

	const balances = { tlm, wax };
	setStorageItem(key, balances, 60);
	return balances;
}

export async function fetchBag(account: string): Promise<ToolItem[]> {
	const key = `bag_${account}`;
	const cache = getStorageItem<ToolItem[]>(key);
	if (cache) {
		return cache;
	}

	const url = `https://wax.pink.gg/v1/chain/get_table_rows`;
	const response = await axios.post<AccountBagResponse>(
		url,
		{
			code: "m.federation",
			json: true,
			limit: 10,
			lower_bound: account,
			scope: "m.federation",
			table: "bags",
			upper_bound: account,
		},
		{ timeout: 10e3 }
	);
	const tools = await async.map<string, ToolItem>(response?.data?.rows[0].items, async a => await fetchToolAsset(a));
	setStorageItem(key, tools, 300);
	return tools;
}

export async function fetchLand(account: string): Promise<LandItem> {
	const key = `land_${account}`;
	const cache = getStorageItem<LandItem>(key);
	if (cache) {
		return cache;
	}

	const url = `https://wax.pink.gg/v1/chain/get_table_rows`;
	const response = await axios.post<AccountMinersResponse>(
		url,
		{
			code: "m.federation",
			json: true,
			limit: 10,
			lower_bound: account,
			scope: "m.federation",
			table: "miners",
			upper_bound: account,
		},
		{ timeout: 10e3 }
	);

	const land = findLand(response?.data?.rows[0]?.current_land);
	setStorageItem(key, land, 300);
	return land;
}

function setStorageItem<T>(key: string, value: T, expiration: number = null): void {
	try {
		const obj: CacheObject<T> = { value, expiration: null };
		if (expiration) {
			obj.expiration = Date.now() + expiration * 1e3;
		}
		localStorage.setItem(key, JSON.stringify(obj));
	} catch (error) {
		localStorage.clear();
	}
}

function getStorageItem<T>(key: string, defaultValue?: T): T {
	try {
		const json = localStorage.getItem(key);
		const obj: CacheObject<T> = JSON.parse(json);
		if (obj?.expiration < Date.now()) {
			return defaultValue;
		}
		if (obj?.value === null || obj?.value === undefined) {
			return defaultValue;
		}
		return obj.value;
	} catch (error) {
		return defaultValue;
	}
}