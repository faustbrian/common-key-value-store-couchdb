import { IKeyValueStoreAsync } from "@konceiver/kv";
import nano from "nano";

export class StoreAsync<K, T> implements IKeyValueStoreAsync<K, T> {
	public static async new<K, T>(opts: { connection: string; database: string }): Promise<StoreAsync<K, T>> {
		const store = nano(opts.connection).db;

		try {
			await store.create(opts.database);
		} catch (error) {} // tslint:disable-line: no-empty

		return new StoreAsync<K, T>(store, opts.database);
	}

	private constructor(private readonly store, private readonly database: string) {}

	public async all(): Promise<Array<[K, T]>> {
		try {
			const { rows } = await this.db.list();

			return Promise.all(rows.map(async row => [row.id, await this.get(row.id)]));
		} catch (error) {
			return [];
		}
	}

	public async keys(): Promise<K[]> {
		try {
			const { rows } = await this.db.list();

			return rows.map(row => row.id);
		} catch (error) {
			return [];
		}
	}

	public async values(): Promise<T[]> {
		try {
			const { rows } = await this.db.list();

			return Promise.all(rows.map(async row => this.get(row.id)));
		} catch (error) {
			return [];
		}
	}

	public async get(key: K): Promise<T | undefined> {
		try {
			const { value } = await this.db.get(key);

			return value;
		} catch (error) {
			return undefined;
		}
	}

	public async getMany(keys: K[]): Promise<Array<T | undefined>> {
		return Promise.all([...keys].map(async (key: K) => this.get(key)));
	}

	public async pull(key: K): Promise<T | undefined> {
		const item: T | undefined = await this.get(key);

		await this.forget(key);

		return item;
	}

	public async pullMany(keys: K[]): Promise<Array<T | undefined>> {
		const items: Array<T | undefined> = await this.getMany(keys);

		await this.forgetMany(keys);

		return items;
	}

	public async put(key: K, value: T): Promise<boolean> {
		try {
			await this.db.insert({
				_id: key,
				_rev: (await this.db.get(key))._rev,
				value,
			});
		} catch (error) {
			await this.db.insert({ _id: key, value });
		}

		return this.has(key);
	}

	public async putMany(values: Array<[K, T]>): Promise<boolean[]> {
		return Promise.all(values.map(async (value: [K, T]) => this.put(value[0], value[1])));
	}

	public async has(key: K): Promise<boolean> {
		try {
			return (await this.get(key)) !== undefined;
		} catch (error) {
			return false;
		}
	}

	public async hasMany(keys: K[]): Promise<boolean[]> {
		return Promise.all([...keys].map(async (key: K) => this.has(key)));
	}

	public async missing(key: K): Promise<boolean> {
		return !(await this.has(key));
	}

	public async missingMany(keys: K[]): Promise<boolean[]> {
		return Promise.all([...keys].map(async (key: K) => this.missing(key)));
	}

	public async forget(key: K): Promise<boolean> {
		if (await this.missing(key)) {
			return false;
		}

		try {
			const doc = await this.db.get(key);

			await this.db.destroy(doc._id, doc._rev);
			// tslint:disable-next-line: no-empty
		} catch (error) {}

		return this.missing(key);
	}

	public async forgetMany(keys: K[]): Promise<boolean[]> {
		return Promise.all([...keys].map((key: K) => this.forget(key)));
	}

	public async flush(): Promise<boolean> {
		await this.forgetMany(await this.keys());

		return this.isEmpty();
	}

	public async count(): Promise<number> {
		try {
			const { doc_count } = await this.db.info();

			return doc_count;
		} catch (error) {
			return 0;
		}
	}

	public async isEmpty(): Promise<boolean> {
		return (await this.count()) === 0;
	}

	public async isNotEmpty(): Promise<boolean> {
		return !(await this.isEmpty());
	}

	private get db() {
		return this.store.use(this.database);
	}
}
