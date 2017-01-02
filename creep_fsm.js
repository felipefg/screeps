var resourceManager = require('resourceManager');
var pathTools = require('pathTools');

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

/**
 * Base state for when you have to move to a place and then execute an action.
 *
 * The basic algorithm is:
 * - Compute targets and best path
 * - Move along the path
 * - Perform action
 */
class MoveWorkState extends CreepState {

    /**
     * Get a list of valid objectives for the current state.
     *
     * The return format should be an array of objects containing:
     * - pos: The RoomPosition
     * - target: The target structure
     * - range: The range we need to have.
     */
    static getTargets(creep) {
        return [];
    }

    /**
     * Get an object with pathfinder options, if needed.
     */
    static getPathFinderOpts(creep) {
        return {};
    }

    /**
     * Figure out the best path to go.
     */
    static setTargetAndPath(creep) {

        let targets = this.getTargets(creep);

        // If we have no targets, just don't move anywhere.
        if (targets.length == 0) {
            creep.memory.move_path = [];
            creep.memory.target_id = null;
            return null;
        }

        let objectives = targets.map(
            target => {return {pos:target.pos, range: target.range};}
        );

        // Find the optimal path that will take us to at least one of our
        // targets
        let results = pathTools.findPath(
            creep.pos,
            objectives,
            this.getPathFinderOpts(creep)
        );

        if (results.incomplete) {
            console.log("Found incomplete path for " + creep.name + "!!!");
        }

        // Find out the objectives that are in range of the final path location
        let lastPos = creep.pos;

        if (results.path.length > 0) {
            lastPos = results.path[results.path.length - 1];
        }

        let nearest = lastPos.findClosestByRange(targets.map(t => t.target));

        // Serialize data into memory
        creep.memory.move_path = JSON.parse(JSON.stringify(results.path));

        if (nearest) {
            creep.memory.target_id = nearest.id;
        } else {
            creep.memory.target_id = null;
        }

        return nearest;
    }

    /**
     * Perform the movement.
     */
    static move(creep) {
        let path = creep.memory.move_path.map(
            x => new RoomPosition(x.x, x.y, x.roomName)
        );

        let moveRet = 0;

        if (path.length > 0) {
            moveRet = creep.moveByPath(path);

            // Let's ignore moveRet tired.
            if (moveRet == ERR_TIRED) {
                creep.say("tired...");
                moveRet = 0;
            }

        } else {
            console.log(`${creep.name}: Empty path when trying to move.`);
        }

        creep.memory.move_status = moveRet;

        if (moveRet != 0) {
            console.log(`${creep.name}: moveByPath() returned ${moveRet}`);
        }

        return moveRet;
    }

    static hasArrived(creep) {

        let path = creep.memory.move_path;
        if (path && (path.length == 0)) {
            return true;
        }

        let lastPos = path[path.length - 1];

        if ((creep.pos.x == lastPos.x) &&
            (creep.pos.y == lastPos.y) &&
            (creep.pos.roomName == lastPos.roomName))
        {
            return true;
        }

        return false;
    }

    /**
     * Check if target is still valid.
     *
     * This may be used to recompute the path as soon as possible.
     */
    static isTargetValid(creep) {
        return true;
    }

    /**
     * Perform the actual work, once in range of the target.
     */
    static work(creep, target) {
        return;
    }

    // State machine implementation
    static onEnter(creep) {
        this.setTargetAndPath(creep);
    }

    static action(creep) {
        if (creep.memory.move_path === undefined) {
            console.log(`${creep.name}: Error: move_path is undefined.`);
            return;
        }
        if (!this.hasArrived(creep)) {
            // we still have to move. First lets check if our target is still
            // valid. Otherwise, let's pick up another one.
            if (!this.isTargetValid(creep)) {
                this.setTargetAndPath(creep);
            }

            let moveRet = this.move(creep);

            if (moveRet != 0) {
                console.log(
                    `${creep.name}: Move failed. Recomputing and trying again.`
                );
                this.setTargetAndPath(creep);
                this.move(creep);
            }
        } else {
            // We are at the target location. Let's perform the work.
            let target = Game.getObjectById(creep.memory.target_id);
            this.work(creep, target);
        }
    }
}

class ReturningState extends MoveWorkState {

    static getTargets(creep) {

        var targets = creep.room.find(FIND_STRUCTURES, {
                filter: (structure) => {
                    return ((structure.structureType == STRUCTURE_EXTENSION ||
                            structure.structureType == STRUCTURE_SPAWN ||
                            structure.structureType == STRUCTURE_TOWER)
                            && structure.energy < structure.energyCapacity);
                }
        });

        return targets.map(t => {return {pos: t.pos, range: 1, target: t};});
    }

    /**
     * Perform the actual work, once in range of the target.
     */
    static work(creep, target) {
        var result = creep.transfer(target, RESOURCE_ENERGY);

        if (result == ERR_FULL) {
            // Target is full, let's pick another one.
            this.setTargetAndPath(creep);
            result = 0;
        }

        if (result == ERR_NOT_ENOUGH_RESOURCES) {
            // Ignore this error.
            result = 0;
        }
        if (result != 0) {
            console.log(creep.name + ": error " + result
                + " on transfer().");
        }
    }

    static nextState(creep) {

        if (creep.memory.target_id == null) {
            creep.memory.nextState = "idle";
        } else if (creep.carry.energy < creep.carryCapacity) {
            creep.memory.nextState = "gathering";
        }

    }

}

class GatheringState extends MoveWorkState {

    static getTargets(creep) {

        var sources;

        if (creep.memory.sourceId) {
            sources = [{id: creep.memory.sourceId}];
        } else {
            sources = resourceManager.source.findSources(creep);
        }

        let targets = sources.map(t => {
            let struct = Game.getObjectById(t.id);
            return {pos: struct.pos, range: 1, target: struct};
        });

        return targets;
    }

    static setTargetAndPath(creep) {

        var target = super.setTargetAndPath(creep);

        if ((target !== null) && (target.id != creep.memory.sourceId)) {

            resourceManager.source.deallocateSource(creep);

            if (target instanceof Source) {
                resourceManager.source.allocateSource(creep, target.id);
            }
        }
    }

    static work(creep, target) {

        if (target === null) {
            return;
        }

        var harvest = creep.harvest(target);

        if (harvest == ERR_NOT_IN_RANGE) {
            // We still have to move. Let's compute path and hope for better
            // luck next tick.
            this.setTargetAndPath(creep);
            // Ignore this error.
            harvest = 0;
        }
        if (harvest != 0) {
            console.log(`${creep.name}: Error harvesting: ${harvest}`);
            console.log(JSON.stringify(target));
        }
    }

    static onExit(creep) {
        super.onExit(creep);
        resourceManager.source.deallocateSource(creep);
    }

    static onDie(creep) {
        super.onDie(creep);
        resourceManager.source.deallocateSource(creep);
    }

    static nextState(creep) {

        if (creep.memory.target_id === null) {
            // We are, in fact, in idle wait state. Let's try to recompute
            // the state.
            this.setTargetAndPath(creep);
        }

        if (creep.carry.energy >= creep.carryCapacity) {
            setWorkStateOrIdle(creep);
        }
    }

}

class IdleState extends MoveWorkState {

    static getTargets(creep) {
        // "Flee" to somewhere that is at least range=2 away from any
        // structures in the near 11x11 squares.

        var pos_top = creep.pos.y - 5;
        var pos_bottom = creep.pos.y + 5;
        var pos_left = creep.pos.x - 5;
        var pos_right = creep.pos.x + 5;

        var ranges = {};
        ranges[LOOK_RESOURCES] = 2;
        ranges[LOOK_SOURCES] = 3;
        ranges[LOOK_STRUCTURES] = 2;

        var targets = [];
        // Keep track of resources
        creep.room.lookAtArea(
                pos_top, pos_left, pos_bottom, pos_right, true
        ).forEach(obj => {
            if (_.has(ranges, obj.type)) {
                targets.push({
                    pos: new RoomPosition(obj.x, obj.y, creep.room.name),
                    range: ranges[obj.type],
                    target: {id: null}
                });
            }
        });

        return targets;
    }

    static getPathFinderOpts(creep) {
        return {flee: true};
    }

    static work(creep, target) {
        //creep.say("Idle!");
        return;
    }

    static nextState(creep) {
        setWorkStateOrIdle(creep);
    }

}

class UpgradingState extends MoveWorkState {

    static getTargets(creep) {
        return [
            {
                pos: creep.room.controller.pos,
                range: 3,
                target: creep.room.controller
            }
        ];
    }

    static work(creep, target) {
        var result = creep.upgradeController(target);

        if (result == ERR_NOT_ENOUGH_RESOURCES) {
            // Ignore this error.
            result = 0;
        }

        if (result != 0) {
            console.log(creep.name + ": error " + result
                + " on upgradeController().");
        }
    }

    static nextState(creep) {
        if (creep.carry.energy == 0) {
            creep.memory.nextState = "gathering";
        }
    }
}

class BuildingState extends MoveWorkState {

    static getTargets(creep) {
        var targets = creep.room.find(FIND_CONSTRUCTION_SITES);
        return targets.map(t => {return {pos: t.pos, range: 3, target: t};});
    }

    static work(creep, target) {
        var result = creep.build(target);

        if (result == ERR_NOT_ENOUGH_RESOURCES) {
            // Ignore this error.
            result = 0;
        }

        if (result == ERR_INVALID_TARGET) {
            // This construction site has probably already finished.
            this.setTargetAndPath(creep);
            result = 0;
        }

        if (result != 0) {
            console.log(creep.name + ": error " + result
                + " on build().");
        }
    }

    static nextState(creep) {
        if (creep.carry.energy == 0) {
            creep.memory.nextState = "gathering";
        }
    }
}

var states = {
    gathering: GatheringState,
    returning: ReturningState,
    upgrading: UpgradingState,
    building: BuildingState,
    idle: IdleState,
    parking: IdleState,
}

function setWorkStateOrIdle(creep) {

    let roleState = {
        harvester: {
            name: "returning",
            state: ReturningState
        },
        upgrader: {
            name: "upgrading",
            state: UpgradingState
        },
        builder: {
            name: "building",
            state: BuildingState
        }
    }

    let workState = roleState[creep.memory.role];

    if (workState.state.getTargets(creep).length > 0) {
        creep.memory.nextState = workState.name;
    } else {
        creep.memory.nextState = "idle";
    }
}

module.exports = {

    run: function run(creep) {

        if (creep.spawning) {
            return;
        }

        var currState = creep.memory.state;

        if (!creep.memory.hasOwnProperty("nextState")) {
            creep.memory.nextState = currState;
        }

        var nextState = creep.memory.nextState;

        // If we are transitioning state, execute the onEnter event.
        if (nextState != currState) {
            //console.log(`${creep.name}: changing from ${currState} to ${nextState}`);
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
