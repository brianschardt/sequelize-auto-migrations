#!/usr/bin/env node

const path = require("path");
const commandLineArgs = require('command-line-args');
const fs = require("fs");
const Async = require("async");

const migrate = require("../lib/migrate");
const pathConfig = require('../lib/pathconfig');

const optionDefinitions = [
  { name: 'rev', alias: 'r', type: Number, description: 'Set migration revision (default: 0)', defaultValue: 0 },
  { name: 'pos', alias: 'p', type: Number, description: 'Run first migration at pos (default: 0)', defaultValue: 0 },
  { name: 'one', type: Boolean, description: 'Do not run next migrations', defaultValue: false },
  { name: 'list', alias: 'l', type: Boolean, description: 'Show migration file list (without execution)', defaultValue: false },
  { name: 'migrations-path', type: String, description: 'The path to the migrations folder' },
  { name: 'models-path', type: String, description: 'The path to the models folder' },
  { name: 'help', type: Boolean, description: 'Show this message' }
];

const options = commandLineArgs(optionDefinitions);

// Windows support
if (!process.env.PWD) {
  process.env.PWD = process.cwd()
}

let {
  migrationsDir,
  modelsDir
} = pathConfig(options);

if (!fs.existsSync(modelsDir)) {
  console.log("Can't find models directory. Use `sequelize init` to create it")
  return
}

if (!fs.existsSync(migrationsDir)) {
  console.log("Can't find migrations directory. Use `sequelize init` to create it")
  return
}

if (options.help) {
  console.log("Simple sequelize migration execution tool\n\nUsage:");
  optionDefinitions.forEach((option) => {
    let alias = (option.alias) ? ` (-${option.alias})` : '\t';
    console.log(`\t --${option.name}${alias} \t${option.description}`);
  });
  process.exit(0);
}

const sequelize = require(modelsDir).sequelize;

const queryInterface = sequelize.getQueryInterface();

// execute all migration from
let fromRevision = options.rev;
let fromPos = parseInt(options.pos);
let stop = options.one;

let migrationFiles = fs.readdirSync(migrationsDir)
  // filter JS files
  .filter((file) => {
    return (file.indexOf('.') !== 0) && (file.slice(-3) === '.js');
  })
  // sort by revision
  .sort((a, b) => {
    let revA = parseInt(path.basename(a).split('-', 2)[0]),
      revB = parseInt(path.basename(b).split('-', 2)[0]);
    if (revA < revB) return -1;
    if (revA > revB) return 1;
    return 0;
  })
// remove all migrations before fromRevision
// .filter((file) => {
//   let rev = parseInt(path.basename(file).split('-', 2)[0]);
//   return (rev >= fromRevision);
// });


if (options.list)
  process.exit(0);

async function executeSql(queryInterface, sql) {
  return queryInterface.sequelize.query(
    sql, {
    type: queryInterface.sequelize.QueryTypes.SELECT
  });
}

(async () => {
//   let createIfNot = await executeSql(queryInterface,
//     'CREATE TABLE IF NOT EXISTS "SequelizeMeta" (name varchar UNIQUE)'
//     );
//   let res = await executeSql(queryInterface, 'select * from "SequelizeMeta"');
  
  var loggedDialect=queryInterface.sequelize.options.dialect;
  var createIfNotQuery;
  if(loggedDialect=='mysql')
  {
    createIfNotQuery='CREATE TABLE IF NOT EXISTS "SequelizeMeta" (name varchar UNIQUE)'
  }
  else if(loggedDialect=='mssql')
  {
    createIfNotQuery='IF NOT EXISTS (SELECT * FROM sysobjects WHERE name= \'SequelizeMeta \' and xtype= \'U \') CREATE TABLE SequelizeMeta (name varchar(100) not null UNIQUE)'
  }
  let createIfNot = await executeSql(queryInterface,
    createIfNotQuery
    //'CREATE TABLE IF NOT EXISTS "SequelizeMeta" (name varchar UNIQUE)'
    );
    let res;
    if(loggedDialect=='mysql')
    { 
      res = await executeSql(queryInterface, 'select * from "SequelizeMeta"'); 
    }
    else if(loggedDialect=='mssql')
    {
      res = await executeSql(queryInterface, 'select * from SequelizeMeta');
    }
  let ranMigrations = res.map(r => r.name);
  migrationFiles = migrationFiles.filter(mf => {
    return (!ranMigrations.includes(mf));
  })
  migrationFiles.forEach((file) => {
    console.log("\t" + file);
  });

  for (let file of migrationFiles) {
    await migrate.executeMigration(queryInterface, path.join(migrationsDir, file), fromPos);
    await executeSql(queryInterface, `INSERT INTO "SequelizeMeta" ("name") VALUES ('${file}')`);
    fromPos = 0;
  }

  if (migrationFiles.length == 0) {
    console.log('No new migration files found');
  } else {
    console.log('Completed running migrations');
  }
  process.exit(0);
})();
