class CreepState {

    static onEnter(creep) {
        return;
    }

    static action(creep) {
        return;
    }

    static onExit(creep) {
        return;
    }

    static onDie(creep) {
        console.log(`Creep ${creep.name} is dying and is currently ${creep.memory.state}`);
    }

    static nextState(creep) {
        return;
    }

}

class CreepStateGathering extends CreepState {

    static onEnter(creep) {
        // Find a source to gather and let's stick to it.
        var sources = creep.room.find(FIND_SOURCES);
        creep.memory.target_id = sources[0].id;
    }

    static action(creep) {
        var source = Game.getObjectById(creep.memory.target_id);

        if (creep.harvest(source) == ERR_NOT_IN_RANGE) {
            creep.moveTo(source);
        }
    }

    static nextState(creep) {

        if (creep.carry.energy >= creep.carryCapacity) {
            creep.memory.nextState = "returning";
        }
    }

}

class CreepStateReturning extends CreepState {

    static onEnter(creep) {
        // Find a source to gather and let's stick to it.
        var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return ((structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_CONTAINER ||
                            structure.structureType == STRUCTURE_TOWER)
                            && structure.energy < structure.energyCapacity);
                }
        });

        if (targets.length > 0) {
            creep.memory.target_id = targets[0].id;
        } else {
            creep.memory.target_id = null;
        }

    }


    static action(creep) {

        if (creep.memory.target_id === null) {
            return;
        }

        var target = Game.getObjectById(creep.memory.target_id);

        if (creep.transfer(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            creep.moveTo(target);
        }
    }


    static nextState(creep) {

        if (creep.memory.target_id === null) {
            creep.memory.nextState = "parking";
            return;
        }

        if (creep.carry.energy < creep.carryCapacity) {
            creep.memory.nextState = "gathering";
        }
    }

}

class CreepStateParking extends CreepState {

    static onEnter(creep) {
        // "Flee" to somewhere that is at least range=3 away from any
        // structures in the near 11x11 squares.

        var pos_top = creep.pos.y - 5;
        var pos_bottom = creep.pos.y + 5;
        var pos_left = creep.pos.x - 5;
        var pos_right = creep.pos.x + 5;

        var ranges = {};
        ranges[LOOK_RESOURCES] = 2;
        ranges[LOOK_SOURCES] = 2;
        ranges[LOOK_STRUCTURES] = 2;

        var objectives = [];
        // Keep track of resources
        creep.room.lookAtArea(
                pos_top, pos_left, pos_bottom, pos_right, true
        ).forEach(obj => {
            if (_.has(ranges, obj.type)) {
                objectives.push({
                    pos: new RoomPosition(obj.x, obj.y, creep.room.name),
                    range: ranges[obj.type]
                });
            }
        });


        var pathresult = PathFinder.search(creep.pos, objectives, {flee: true});

        var serialized = JSON.parse(JSON.stringify(pathresult.path));
        console.log(JSON.stringify(pathresult));
        console.log(serialized);
        creep.memory.move_path = serialized;
    }

    static action(creep) {

        var path = _.map(creep.memory.move_path, x => new RoomPosition(x.x, x.y, x.roomName));

        var result = creep.moveByPath(path);

        if (result != 0) {
            creep.say("cant move: " + result);
            console.log(creep.memory.move_path);
        } else {
            creep.say('idle!');
        }
    }

    static nextState(creep) {

        var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return ((structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_CONTAINER ||
                            structure.structureType == STRUCTURE_TOWER)
                            && structure.energy < structure.energyCapacity);
                }
        });

        if (targets.length > 0) {
            creep.memory.nextState = "returning";
        }
    }
}

var states = {
    gathering: CreepStateGathering,
    returning: CreepStateReturning,
    parking: CreepStateParking
}



module.exports = {

    run: function run(creep) {

        var currState = creep.memory.state;

        if (!creep.memory.hasOwnProperty("nextState")) {
            creep.memory.nextState = currState;
        }

        var nextState = creep.memory.nextState;

        // If we are transitioning state, execute the onEnter event.
        if (nextState != currState) {
            creep.memory.state = nextState;
            states[nextState].onEnter(creep);

            currState = nextState;
        }

        // Perform the state action
        states[currState].action(creep);

        // Decide the state transition
        states[currState].nextState(creep);

        // If we are transitioning state, execute the onExit event.
        if (creep.memory.nextState != currState) {
            states[currState].onExit(creep);
        }

        if (creep.ticksToLive <= 1) {
            states[currState].onDie(creep);
        }

    }

}
