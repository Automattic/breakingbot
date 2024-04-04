import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import type { Express } from "express";
import type { pino } from "pino";
import type { Options as HttpOptions, ScopedClient } from "scoped-http-client";

declare module "hubot";

export class Adapter extends EventEmitter {
	robot: Robot;

	constructor(robot: Robot);

	send(envelope: Envelope, ...strings: string[]): void;
	emote(envelope: Envelope, ...strings: string[]): void;
	reply(envelope: Envelope, ...strings: string[]): void;
	topic(envelope: Envelope, ...strings: string[]): void;
	play(envelope: Envelope, ...strings: string[]): void;

	run(): void;
	close(): void;

	receive(message: Message): void;
	http(url: string): ScopedClient;

	users(): User[];
	userForId(id: string, options?: Options): User;
	userForName(name: string): User | null;
	usersForRawFuzzyName(fuzzyName: string): User[];
	usersForFuzzyName(fuzzyName: string): User[];
}

export class DataStore {
	constructor(robot: Robot);
	set(key: string, value: unknown): Promise<void>;
	setObject(key: string, objectKey: string, value: unknown): Promise<void>;
	setArray(key: string, value: unknown[]): Promise<void>;
	get(key: string): Promise<unknown>;
	getObject(key: string, objectKey: string): Promise<unknown>;
}

export class DataStoreUnavailable extends Error {}

export class Middleware<T extends Adapter = Adapter> {
	robot: Robot<T>;
	stack: MiddlewareHandler<T>[];
	constructor(robot: Robot<T>);
	execute(context: MiddlewareContext<T>): boolean;
	register(middleware: MiddlewareHandler<T>): void;
}

export class Brain<A extends Adapter> extends EventEmitter {
	constructor(robot: Robot<A>);
	set(key: string, value: unknown): this;
	get(key: string): unknown;
	remove(key: string): this;
	save(): void;
	close(): void;
	setAutoSave(enabled: boolean): void;
	resetSaveInterval(seconds: number): void;
	mergeData(data: { [key: string]: unknown }): void;
	users(): User[];
	userForId(id: string, options?: Options): User;
	userForName(name: string): User | null;
	usersForRawFuzzyName(fuzzyName: string): User[];
	usersForFuzzyName(fuzzyName: string): User[];
}

export class User {
	constructor(id: string, options?: Options);
	id: string;
	name: string;
	set(key: string, value: unknown): this;
	get(key: string): unknown;
	[property: string]: unknown;
}

export class Message {
	constructor(user: User, done?: boolean);
	id: string;
	user: User;
	text: string | null;
	room: string;
	finish(): void;
}

export class TextMessage extends Message {
	text: string;

	constructor(user: User, text: string, id: string);

	match(regex: RegExp): RegExpMatchArray;
	toString(): string;
}

export class EnterMessage extends Message {
	text: null;

	constructor(user: User, text: string | null, id: string);
}

export class LeaveMessage extends Message {
	text: null;

	constructor(user: User, text: string | null, id: string);
}

export class TopicMessage extends TextMessage {
	text: string;
}

export class CatchAllMessage extends Message {
	message: Message;

	constructor(message: Message);
}

export interface Envelope {
	room: string;
	user: User;
	message: Message;
}

export type Logger = pino.Logger;

export class Shell extends Adapter {}

type Options = { [key: string]: unknown };

export class Response<
	A extends Adapter = Adapter,
	_M extends Message = Message,
> {
	match: RegExpMatchArray;
	message: Message;
	envelope: Envelope;

	constructor(robot: Robot<A>, message: Message, match: RegExpMatchArray);
	send(...strings: string[]): void;
	emote(...strings: string[]): void;
	reply(...strings: string[]): void;
	topic(...strings: string[]): void;
	play(...strings: string[]): void;
	locked(...strings: string[]): void;
	random<T>(items: T[]): T;
	finish(): void;
	http(url: string, options?: HttpOptions): ScopedClient;
}

export type ListenerCallback<
	A extends Adapter = Adapter,
	M extends Message = Message,
> = (response: Response<A, M>) => void;

export interface MiddlewareContext<T extends Adapter = Adapter> {
	response?: Response<T> | undefined;
	listener: { options: { [key: string]: unknown }; [key: string]: unknown };
	[key: string]: unknown;
}
export type MiddlewareHandler<T extends Adapter = Adapter> = (
	context: MiddlewareContext<T>,
) => boolean | Promise<boolean>;

export class Robot<A extends Adapter = Adapter> {
	readonly name: string;
	readonly events: EventEmitter;
	readonly brain: Brain<A>;
	readonly alias: string;
	readonly adapterPath: string;
	readonly adapterName: string;
	readonly adapter: A;
	readonly errorHandlers: [];
	readonly onUncaughtException: (err: Error) => void;
	readonly datastore: null | DataStore;
	readonly commands: [];
	readonly middleware: {
		listener: Middleware<A>;
		response: Middleware<A>;
		receive: Middleware<A>;
	};
	readonly logger: Logger;
	readonly pingIntervalId: null | NodeJS.Timeout;
	readonly globalHttpOptions: HttpOptions;
	readonly version: string;
	readonly server?: Server | undefined;
	readonly router: Express;

	constructor(
		adapter: Adapter | string,
		httpd: boolean,
		name?: string,
		alias?: string,
	);
	catchAll(callback: ListenerCallback<A, CatchAllMessage>): void;
	catchAll(
		options: Options,
		callback: ListenerCallback<A, CatchAllMessage>,
	): void;
	emit(event: string | symbol, ...args: unknown[]): void;
	enter(callback: ListenerCallback<A, EnterMessage>): void;
	enter(options: Options, callback: ListenerCallback<A, EnterMessage>): void;
	error(cb: (error: Error, res?: Response) => void): void;
	hear(regex: RegExp, callback: ListenerCallback<A, TextMessage>): void;
	hear(
		regex: RegExp,
		options: Options,
		callback: ListenerCallback<A, TextMessage>,
	): void;
	helpCommands(): string[];
	http(url: string, options?: HttpOptions): ScopedClient;
	leave(callback: ListenerCallback<A, LeaveMessage>): void;
	leave(options: Options, callback: ListenerCallback<A, LeaveMessage>): void;
	listen(
		matcher: (message: Message) => boolean,
		callback: ListenerCallback<A>,
	): void;
	listen(
		matcher: (message: Message) => boolean,
		options: Options,
		callback: ListenerCallback<A>,
	): void;
	listenerMiddleware(middleware: MiddlewareHandler<A>): void;
	loadExternalScripts(packages: string[]): void;
	loadFile(directory: string, fileName: string): void;
	loadHubotScripts(path: string, scripts: string[]): void;
	messageRoom(room: string, ...strings: string[]): void;
	on(event: string | symbol, listener: (...args: unknown[]) => void): this;
	receive(message: Message, cb?: () => void): void;
	receiveMiddleware(middleware: MiddlewareHandler<A>): void;
	reply(envelope: Envelope, ...strings: string[]): void;
	respond(regex: RegExp, callback: ListenerCallback<A, TextMessage>): void;
	respond(
		regex: RegExp,
		options: Options,
		callback: ListenerCallback<A, TextMessage>,
	): void;
	respondPattern(regex: RegExp): RegExp;
	responseMiddleware(middleware: MiddlewareHandler<A>): void;
	run(): void;
	send(envelope: Envelope, ...strings: string[]): void;
	shutdown(): void;
	topic(callback: ListenerCallback<A, TopicMessage>): void;
	topic(options: Options, callback: ListenerCallback<A, TopicMessage>): void;
}
