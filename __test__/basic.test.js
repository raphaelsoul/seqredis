const Sequelize = require("sequelize");
const Redis = require("redis");
const seqredis = require("../index");

const sequelize = new Sequelize("postgres://root:root@localhost:5432/ihentai_test", {
	dialect: "postgres",
	logging: false
});
const redis = Redis.createClient();

const User = sequelize.define('User', {
	username: Sequelize.STRING,
	birthday: Sequelize.DATE
});

seqredis({ sequelize, redis });


describe("testing sequelize instance attaching...", function () {

	beforeAll(async () => {
		await new Promise((resolve, reject) => {
			redis.flushdb((e, succeed) => {
				if (e) return reject(e);
				return resolve(succeed);
			})
		});
		await User.drop();
		await User.sync();
		await User.create({
			username: 'janedoe',
			birthday: new Date(1980, 6, 20)
		});
	});

	it('should insert a new row and write into redis', function (done) {
		// first query
		User.findOne({ where: { username: "janedoe" } })
			.then(jane => {
				// console.log("jane", jane);
				expect(jane).toBeInstanceOf(User);
				expect(jane.hitCache).toBeFalsy();
			})
			.then(() => {
				// second query
				return User.findOne({ where: { username: "janedoe" } });
			})
			.then(jane2 => {
				expect(jane2).toBeInstanceOf(User);
				expect(jane2.hitCache).toBeTruthy();
				done();
			})
			.catch(e => {
				done(e);
			});
	});

	afterAll(async () => {
		await sequelize.close();
		await redis.quit();

	});
});
