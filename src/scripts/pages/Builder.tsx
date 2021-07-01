import G from "generatorics";
import _ from "lodash";
import React, { createRef, RefObject } from "react";
import ReactDOM from "react-dom";
import { WaxAuthClient } from "wax-auth-client";
import "../../style/builder.less";
import { Error } from "../components/Error";
import { Footer } from "../components/Footer";
import { Header } from "../components/Header";
import { InventoryTool, ToolItem } from "../types/types";
import { URLHashManager } from "../util/URLHashManager";
import { calculateToolsDelay, calculateToolsLuck, calculateToolsPower, findTool, getInventoryAssets } from "../util/utilities";
import { BasePage } from "./BasePage";

interface BuilderState {
	loading?: boolean;
	error?: boolean;
	account?: string;
	inventory?: InventoryTool[];
	builds?: ToolItem[][];
	sortParam?: string;
	order: "asc" | "desc";
}

export class Spy extends BasePage<unknown, BuilderState> {
	private accountRef: RefObject<HTMLInputElement> = createRef();
	private auth: WaxAuthClient;

	constructor(props: unknown) {
		super(props);
		this.state = { sortParam: "power", order: "desc" };

		this.auth = new WaxAuthClient();

		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		addEventListener(URLHashManager.ACCOUNT_CHANGE_EVENT, (e: CustomEvent<string>) => {
			this.fetchAccount(e.detail);
		});
	}

	componentDidMount(): void {
		const account = this.hashManager.getHashParam(URLHashManager.ACCOUNT_PARAM);

		if (account) {
			this.fetchAccount(account);
		}
	}

	selectAccount(): void {
		const account = this.accountRef.current.value.trim().toLowerCase();

		this.hashManager.setHashParam(URLHashManager.ACCOUNT_PARAM, account);
	}

	async fetchAccount(account: string): Promise<void> {
		this.accountRef.current.value = account;

		try {
			this.setState({ loading: true, error: false });

			const inventory = await getInventoryAssets(account);

			const tools = _(inventory)
				.groupBy(a => a.template)
				.map<InventoryTool>((a, t) => ({ tool: findTool(t), count: a.length, assets: a.slice(0, 3) }))
				.filter(t => !_.isNil(t.tool))
				.flattenDeep()
				.value();

			this.setState({ loading: false, account, inventory: tools });

			// const toolTemplates = _(tools)
			// 	.mapKeys(t => t.tool.template)
			// 	.mapValues(t => Math.min(3, t.count))
			// 	.value();

			// const powerSetInput = _(toolTemplates)
			// 	.map((v, k) => Array(v).fill(k))
			// 	.flatten()
			// 	.value();

			const powerSetInput = _(tools)
				.map(t => t.assets)
				.flatten()
				.map(a => a.asset)
				.value();

			// console.log({ inventory, tools, toolTemplates, powerSetInput });
			console.log({ inventory, tools, powerSetInput });

			const perms: string[] = [];
			const set: Generator<string[]> = G.powerSet(powerSetInput, 3);

			for (let perm of set) {
				perm = _.uniq(perm);

				if (perm.length > 0 && perm.length <= 3) {
					const combo = perm.sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).join(",");
					perms.push(combo);
				}
			}

			console.log({ perms });

			const builds = _(perms)
				.uniq()
				.sortBy()
				.map(combo => combo.split(","))
				.map(set => set.map(id => _(inventory).find(a => a.asset == id)))
				.map(set => set.map(t => findTool(t.template, t.asset)))
				.uniqBy(set =>
					set
						.map(t => t.template)
						.sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
						.join(",")
				)
				.orderBy([tools => tools.length], ["desc"])
				.value();

			console.log({ builds });

			this.setState({ builds });
		} catch (error) {
			this.setState({ loading: false, error: true });
		}
	}

	setSortingParam(param: string): void {
		const order = this.state.sortParam != param ? "desc" : this.state.order === "asc" ? "desc" : "asc";
		this.setState({ sortParam: param, order });
	}

	async setBag(tools: ToolItem[]): Promise<void> {
		const toolAssets = _(tools)
			.map(t => t.asset)
			.value();

		const waxAddress = await this.auth.loginWax();

		if (waxAddress !== this.state.account) {
			alert("You have no access to the selected account");
			return;
		}

		try {
			const result = await this.auth.wax.api.transact(
				{
					actions: [
						{
							account: "m.federation",
							name: "setbag",
							authorization: [{ actor: waxAddress, permission: "active" }],
							data: { account: waxAddress, items: toolAssets },
						},
					],
				},
				{ blocksBehind: 0, expireSeconds: 1200 }
			);

			console.log({ result });
		} catch (error) {
			alert(error);
		}
	}

	render(): JSX.Element {
		return (
			<div className="page builder">
				<Header title="Alien Worlds setup builder" />
				<div className="body">
					<div className="controls">
						<label htmlFor="waxid">Account</label>
						<input
							ref={this.accountRef}
							autoComplete="off"
							type="text"
							id="waxid"
							className="waxid"
							placeholder="monke.wam"
							onKeyPress={e => e.key == "Enter" && this.selectAccount()}
						/>
						<input type="button" className="select" value="Select" onClick={() => this.selectAccount()} />
					</div>
					{this.state.loading && <div className="loading"></div>}
					{this.state.error && <Error />}
					{!this.state.loading && !this.state.error && (
						<>
							{this.state.inventory && (
								<div className="inventory">
									<h2 className="title">Inventory</h2>
									<div className="holder">
										{this.state.inventory.map(t => (
											<div className="tool" key={`inventory-${t?.tool?.template}`}>
												<img src={`https://cloudflare-ipfs.com/ipfs/${t.tool.img}`} className="card" />
												{/* <img className="card" /> */}
												<div className="info">
													<span className="name">{t?.tool?.name}</span>
													<span className="count">{t?.count}</span>
												</div>
											</div>
										))}
									</div>
								</div>
							)}
							{this.state.builds && (
								<div className="builds">
									<h2 className="title">Possible Builds</h2>
									<table className="holder">
										<thead className="table-head">
											<tr>
												<th className="tools">Tools</th>
												<th onClick={() => this.setSortingParam("power")} className="power">
													Power
												</th>
												<th onClick={() => this.setSortingParam("luck")} className="luck">
													Luck
												</th>
												<th onClick={() => this.setSortingParam("delay")} className="delay">
													Delay
												</th>
												<th onClick={() => this.setSortingParam("tlmmin")} className="tlm-min">
													TLM/Min
												</th>
												<th onClick={() => this.setSortingParam("luckmin")} className="luck-min">
													Luck/Min
												</th>
											</tr>
										</thead>
										<tbody>
											{this.state.builds
												.map(tools => ({
													tools,
													stats: {
														power: calculateToolsPower(tools),
														luck: calculateToolsLuck(tools),
														delay: calculateToolsDelay(tools),
														tlmmin: calculateToolsPower(tools) / (calculateToolsDelay(tools) / 60),
														luckmin: calculateToolsLuck(tools) / (calculateToolsDelay(tools) / 60),
													},
												}))
												.sort(
													(a, b) =>
														(this.state.order === "asc" ? 1 : -1) *
														(a.stats[this.state.sortParam] - b.stats[this.state.sortParam])
												)
												.map(({ tools, stats }) => (
													<tr className="build" key={tools.map(t => t.template).join(",")}>
														<td onClick={() => this.setBag(tools)} className="tools">
															{tools
																.sort((a, b) => a.name.localeCompare(b.name))
																.map((tool, i) => (
																	<div className="tool" key={`build-${i}-${tool.template}`}>
																		<div className="info">
																			<span className="name">{`${tool.name} (${tool.shine})`}</span>
																		</div>
																	</div>
																))}
														</td>
														<td className="power">{_.round(stats.power, 2)}</td>
														<td className="luck">{_.round(stats.luck, 2)}</td>
														<td className="delay">{_.round(stats.delay, 2)}</td>
														<td className="tlm-min">{_.round(stats.tlmmin, 3)}</td>
														<td className="luck-min">{_.round(stats.luckmin, 3)}</td>
													</tr>
												))}
										</tbody>
									</table>
								</div>
							)}
						</>
					)}
				</div>
				<Footer />
			</div>
		);
	}
}

(async () => {
	ReactDOM.render(<Spy />, document.getElementById("root"));
})();