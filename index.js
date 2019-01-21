const debug = require("debug")("seqredis");
const hash = require("node-object-hash")().hash;

const METHODS = [
	"findByPrimary", "findById", "findByPk",
	"find", "findOne",
	"findAndCount", "findAndCountAll",
	"findOrInitialize", "findOrBuild",

	"findAll"
];

const hackModel = (model, options) => {
	const {generateKey, cacher} = options;

	METHODS.map(method => {
		model[`_cache_${method}`] = model[method];
		model[method] = function (...args) {
			args.method = method;
			args.tableName = model.tableName;
			args.modelName = model.name;
			const key = generateKey(args);
			return cacher.read(key).then(reply => {
				if (!reply) {
					debug("should query in DB");
					return model[`_cache_${method}`](...args);
				}
				debug("should init instance with cached data");

				reply = JSON.parse(reply);

				if (!Array.isArray(reply)) {
					let instance = model.build(reply); // todo need a better way
					instance.hitCache = true;
					instance.isNewRecord = false;
					return instance;
				}

				let rows = reply.map(row => {
					let instance = model.build(row);
					instance.hitCache = true;
					instance.isNewRecord = false;
					return instance;
				});
				rows.hitCache = true;
				return rows;
			}).then(data => {
				// insert into redis
				return cacher.write(key, data, options.ttl).then(() => data);
			});
		}
	});
};

const DEFAULTS = {
	namespace: "seqredis",
	generateKey: args => {
		return hash(args);
	},
	ttl: 1000 * 60 * 10,
};

module.exports = (options) => {
	options = Object.assign({}, DEFAULTS, options);
	options.cacher =  {
		read(key) {
			return new Promise((resolve, reject) => {
				options.redis.get(key, (e, reply) => {
					if (e) return reject(e);
					return resolve(reply)
				});
			})
		},
		write(key, data, ttl) {
			return new Promise((resolve, reject) => {
				options.redis.set(key, JSON.stringify(data), 'EX', ttl, (e, reply) => {
					if (e) return reject(e);
					return resolve(reply)
				});
			})
		}
	};

	const { sequelize } = options;

	//debug(sequelize);

	for (let model in sequelize.models) {
		if (!sequelize.models.hasOwnProperty(model)) {
			return;
		}
		// console.log(model);
		hackModel(sequelize.models[model], options);
	}
};

