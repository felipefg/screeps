var roleHarvester = require('role.harvester');
var roleBuilder = require('role.builder');
var creepFSM = require("creep_fsm");

function constructions_pct(room) {
    var progress = 0;
    var progressTotal = 0;
    var progressRel = 1.0;

    var sites = room.find(FIND_CONSTRUCTION_SITES);

    for (let i=0; i < sites.length; ++i) {

        var site = sites[i];
        progress += site.progress;
        progressTotal += site.progressTotal;

    }

    if (progressTotal != 0) {
        progressRel = progress / progressTotal;
    }

    console.log('Constructions in ' + room.name + ": " + (progressRel * 100.0) +  "%");

}


module.exports.loop = function () {

    //console.log(`Tick ${Game.time}`);
    // Garbage collecting the Memory
    for(var name in Memory.creeps) {
        if(!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Clearing non-existing creep memory:', name);
        }
    }

    //constructions_pct(Game.rooms.W7N3);

    // Spawn more harvesters as necessary
    var harvesters = _.filter(Game.creeps, (creep) => creep.memory.role == 'harvester');
    var builders = _.filter(Game.creeps, (creep) => creep.memory.role == 'builder');
    var upgraders = _.filter(Game.creeps, (creep) => creep.memory.role == 'upgrader');

    if(harvesters.length < 1) {
        var newName = Game.spawns['Spawn1'].createCreep(
            [WORK,CARRY,MOVE],
            undefined,
            {creepClass: "worker", role: 'harvester', nextState: "gathering"}
        );
        console.log('Spawning new harvester: ' + newName);
    }

    if(builders.length < 0) {
        var newName = Game.spawns['Spawn1'].createCreep([WORK,CARRY,MOVE], undefined, {role: 'builder', nextState: "gathering"});
        console.log('Spawning new builder: ' + newName);
    }

    if(upgraders.length < 5) {
        var newName = Game.spawns['Spawn1'].createCreep(
            [WORK, WORK, CARRY, CARRY, MOVE, MOVE],
            undefined,
            {creepClass: "worker", role: 'upgrader', nextState: "gathering"}
        );
        console.log('Spawning new upgrader: ' + newName);
    }

    var tower = Game.getObjectById('TOWER_ID');
    if(tower) {
        var closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: (structure) => structure.hits < structure.hitsMax
        });
        if(closestDamagedStructure) {
            tower.repair(closestDamagedStructure);
        }

        var closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
        if(closestHostile) {
            tower.attack(closestHostile);
        }
    }

    for(var name in Game.creeps) {
        var creep = Game.creeps[name];
        if(creep.memory.creepClass == 'worker') {
            creepFSM.run(creep);
        }
        if(creep.memory.role == 'builder') {
            roleBuilder.run(creep);
        }
    }
}
