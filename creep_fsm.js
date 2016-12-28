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
        console.log("Creep ${creep.name} is dying and is currently ${creep.memory.state.");
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

        /*
        if (creep.memory.target_id === null) {
            creep.memory.nextState = "parking";
            return;
        }
        */

        if (creep.carry.energy == 0) {
            creep.memory.nextState = "gathering";
        }
    }

}


var states = {
    gathering: CreepStateGathering,
    returning: CreepStateReturning
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

    }

}
