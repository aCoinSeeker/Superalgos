﻿const axios = require('axios')
const auth = require('./utils/auth')

exports.newCommons = function newCommons(bot, logger, UTILITIES) {

    const { orderMessage } = require("@superalgos/mqservice")

    const {
      MESSAGE_ENTITY, MESSAGE_TYPE, ORDER_CREATOR, ORDER_TYPE,
            ORDER_OWNER, ORDER_DIRECTION, ORDER_STATUS, ORDER_EXIT_OUTCOME,
            createMessage, getMessage, getExpandedMessage
    } = orderMessage.newOrderMessage()


    const FULL_LOG = true;
    const LOG_FILE_CONTENT = false;

    const MODULE_NAME = "Commons";
    const ONE_DAY_IN_MILISECONDS = 24 * 60 * 60 * 1000;
    const GMT_SECONDS = ':00.000 GMT+0000';

    let thisObject = {
        initializeData: initializeData,
        runSimulation: runSimulation,
        buildLRC: buildLRC,
        buildPercentageBandwidthMap: buildPercentageBandwidthMap,
        buildBollingerBandsMap: buildBollingerBandsMap,
        buildBollingerChannelsArray: buildBollingerChannelsArray,
        buildBollingerSubChannelsArray: buildBollingerSubChannelsArray,
        buildCandles: buildCandles
    };

    let utilities = UTILITIES.newCloudUtilities(bot, logger);

    let LRCMap = new Map();
    let percentageBandwidthMap = new Map();
    let bollingerBandsMap = new Map();
    let bollingerChannelsArray = [];
    let bollingerSubChannelsArray = [];

    let candles = [];

    return thisObject;

    function initializeData() {

        LRCMap = new Map();
        percentageBandwidthMap = new Map();
        bollingerBandsMap = new Map();
        bollingerChannelsArray = [];
        bollingerSubChannelsArray = [];

        candles = [];
    }

    async function runSimulation(
        recordsArray,
        conditionsArray,
        strategiesArray,
        tradesArray,
        lastObjectsArray,
        tradingSystem,
        timePeriod,
        currentDay,
        startDate,
        endDate,
        interExecutionMemory,
        callback) {

        try {

            if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] runSimulation -> Entering function."); }

            tradingSystem.strategies = await getStrategies();

            /* Initial Values */

            let initialDate = startDate;      
            let initialBalanceA = 1;
            let minimunBalanceA = 0.5;

            /* Strategy and Phases */

            let strategyNumber = 0;
            let strategyPhase = 0;  // So far we will consider 5 possible phases: 0 = Initial state, 1 = Signal to buy, 2 = Buy, 3 = After Buy, 4 = Sell.

            /* Stop Loss Management */

            const MIN_STOP_LOSS_VALUE = 1 // We can not let the stop be zero to avoid division by 0 error or infinity numbers as a result.
            let previousStopLoss = 0;
            let stopLoss = 0;
            let stopLossPhase = 0;

            /* Take Profit Management */

            const MIN_TAKE_PROFIT_VALUE = 1 // We can not let the buy order be zero to avoid division by 0 error or infinity numbers as a result.
            let previousTakeProfit = 0;
            let takeProfit = 0;
            let takeProfitPhase = 0;

            /* Simulation Records */

            let positionRate = 0;
            let positionSize = 0;
            let positionInstant;

            let previousBalanceAssetA = 0;
            let hitRatio = 0;
            let ROI = 0;
            let days = 0;
            let anualizedRateOfReturn = 0;
            let type = '""';
            let marketRate = 0;

            /* In some cases we need to know if we are positioned at the last candle of the calendar day, for that we need thse variables. */

            let lastInstantOfTheDay = currentDay.valueOf() + ONE_DAY_IN_MILISECONDS - 1;
            let lastCandle = candles[candles.length - 1];

            /* These 2 objects will allow us to create separate files for each one of them. */

            let currentStrategy = {
                begin: 0,
                end: 0,
                status: 0,
                number: 0
            }

            let currentTrade = {
                begin: 0,
                end: 0,
                status: 0,
                profit: 0,
                exitType: 0,
                beginRate: 0,
                endRate: 0
            }

            /*
            The following counters need to survive multiple executions of the similator and keep themselves reliable.
            This is challenging when the simulation is executed using Daily Files, since each execution means a new
            day and these counters are meant to be kept along the whole market.

            To overcome this problem, we use the interExecutionMemory to record the values of the current execution
            when finish. But there are a few details:

            1. When the process is at the head of the market, it executes multple times at the same day.
            2. The same code serves execution from Market Files.
            3. In Daily Files we are receiving candles from the current day and previous day, so we need to take care of
               not adding to the counters duplicate info when processing the day before candles.

            To overcome these challenges we record the values of the counters and variables on the interExecutionMemory only when
            the day is complete and if we have a currentDay. That menas that for Market Files we will never use
            interExecutionMemory.
            */

            let balanceAssetA = initialBalanceA;
            let balanceAssetB = 0;

            let lastProfit = 0;
            let profit = 0;
            let lastProfitPercent = 0;

            let roundtrips = 0;
            let fails = 0;
            let hits = 0;
            let periods = 0;

            /* Message to the Simulation Executor */

            let orderId = 0;
            let messageId = 0;

            let yesterday = {};

            yesterday.balanceAssetA = balanceAssetA;
            yesterday.balanceAssetB = balanceAssetB;

            yesterday.lastProfit = 0;
            yesterday.profit = 0;
            yesterday.lastProfitPercent = 0;

            yesterday.Roundtrips = 0;
            yesterday.fails = 0;
            yesterday.hits = 0;
            yesterday.Periods = 0;

            yesterday.orderId = 0;
            yesterday.messageId = 0;

            yesterday.hitRatio = 0;
            yesterday.ROI = 0;
            yesterday.anualizedRateOfReturn = 0;

            if (interExecutionMemory.roundtrips === undefined) {

                /* Initialize the data structure we will use inter execution. */

                interExecutionMemory.balanceAssetA = balanceAssetA;
                interExecutionMemory.balanceAssetB = balanceAssetB;

                interExecutionMemory.lastProfit = lastProfit;
                interExecutionMemory.profit = profit;
                interExecutionMemory.lastProfitPercent = lastProfitPercent;

                interExecutionMemory.roundtrips = 0;
                interExecutionMemory.fails = 0;
                interExecutionMemory.hits = 0;
                interExecutionMemory.periods = 0;

                interExecutionMemory.orderId = 0;
                interExecutionMemory.messageId = 0;

                interExecutionMemory.hitRatio = 0;
                interExecutionMemory.ROI = 0;
                interExecutionMemory.anualizedRateOfReturn = 0;

            } else {

                /* We get the initial values from the day previous to the candles we receive at the current execution */

                if (currentDay.valueOf() >= startDate.valueOf() + ONE_DAY_IN_MILISECONDS) { // Only after the first day we start grabbing the balance from this memory.

                    balanceAssetA = interExecutionMemory.balanceAssetA;
                    balanceAssetB = interExecutionMemory.balanceAssetB;

                    yesterday.balanceAssetA = balanceAssetA;
                    yesterday.balanceAssetB = balanceAssetB;

                } 
                
                lastProfit = interExecutionMemory.lastProfit;
                profit = interExecutionMemory.profit;
                lastProfitPercent = interExecutionMemory.lastProfitPercent;

                roundtrips = interExecutionMemory.roundtrips;
                fails = interExecutionMemory.fails;
                hits = interExecutionMemory.hits;
                periods = interExecutionMemory.periods;

                orderId = interExecutionMemory.orderId;
                messageId = interExecutionMemory.messageId;

                hitRatio = interExecutionMemory.hitRatio;
                ROI = interExecutionMemory.ROI;
                anualizedRateOfReturn = interExecutionMemory.anualizedRateOfReturn;

                yesterday.hitRatio = hitRatio;
                yesterday.ROI = ROI;
                yesterday.anualizedRateOfReturn = anualizedRateOfReturn;
                
            }
           
            /* Main Simulation Loop: We go thourgh all the candles at this time period. */

            for (let i = 0; i < candles.length; i++) {

                /* Update all the data objects available for the simulation. */

                let candle = candles[i];
                let percentageBandwidth = percentageBandwidthMap.get(candle.begin);
                let bollingerBand = bollingerBandsMap.get(candle.begin);
                //let LRC = LRCMap.get(candle.begin);

                //if (LRC === undefined) { continue; }
                if (percentageBandwidth === undefined) { continue; } // percentageBandwidth might start after the first few candles.
                if (candle.begin < initialDate.valueOf()) { continue; }

                periods++;
                days = periods * timePeriod / ONE_DAY_IN_MILISECONDS;

                if (currentDay !== undefined) {
                    if (candle.end < currentDay.valueOf()) {
                        yesterday.Periods++;
                    }
                }

                let channel = getElement(bollingerChannelsArray, candle.begin, candle.end);
                let subChannel = getElement(bollingerSubChannelsArray, candle.begin, candle.end);

                let lastObjects = {
                    candle: clone(candle),
                    //LRC: clone(LRC),
                    bollingerBand: clone(bollingerBand),
                    percentageBandwidth: clone(percentageBandwidth),
                    channel: clone(channel),
                    subChannel: clone(subChannel)
                }

                function clone(obj) {
                    if (null == obj || "object" != typeof obj) return obj;
                    var copy = obj.constructor();
                    for (var attr in obj) {
                        if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
                    }
                    return copy;
                }

                lastObjects.candle.previous = undefined;
                //lastObjects.LRC.previous = undefined;
                lastObjects.bollingerBand.previous = undefined;
                lastObjects.percentageBandwidth.previous = undefined;
                lastObjects.channel.previous = undefined;
                lastObjects.subChannel.previous = undefined;

                lastObjectsArray.push(lastObjects);

                if (lastObjectsArray.length > 5) {
                    lastObjectsArray.splice(0,1);
                }

                let conditions = new Map;       // Here we store the conditions values that will be use in the simulator for decision making.
                let conditionsArrayRecord = []; // These are the records that will be saved in a file for the plotter to consume.
                let conditionsArrayValues = []; // Here we store the conditions values that will be written on file for the plotter.

                /* We define and evaluate all conditions to be used later during the simulation loop. */

                conditionsArrayRecord.push(candle.begin);
                conditionsArrayRecord.push(candle.end);

                evaluateConditions(tradingSystem, conditions);



                /* Strategy Enter Condition */

                if (strategyNumber === 0 &&
                    balanceAssetA > minimunBalanceA) {

                    /*
                    Here we need to pick a strategy, or if there is not suitable strategy for the current
                    market conditions, we pass until the next period.
    
                    To pick a new strategy we will evaluate what we call an entering condition. Once we enter
                    into one strategy, we will ignore market conditions for others. However there is also
                    a strategy exit condition which can be hit before entering into a trade. If hit, we would
                    be outside a strategy again and looking for the condition to enter all over again.

                    */

                    checkEntryPoints();

                    function checkEntryPoints() {

                        for (let j = 0; j < tradingSystem.strategies.length; j++) {

                            let strategy = tradingSystem.strategies[j];

                            for (let k = 0; k < strategy.triggerOn.situations.length; k++) {

                                let situation = strategy.triggerOn.situations[k];
                                let passed = true;

                                for (let m = 0; m < situation.conditions.length; m++) {

                                    let condition = situation.conditions[m];
                                    let key = strategy.name + '-' + situation.name + '-' + condition.name

                                    let value = conditions.get(key).value;

                                    if (value === false) { passed = false; }
                                }

                                if (passed) {

                                    strategyPhase = 1;
                                    strategyNumber = j + 1;
                                    currentStrategy.begin = candle.begin;
                                    currentStrategy.beginRate = candle.min;
                                    currentStrategy.endRate = candle.min; // In case the strategy does not get exited
                                    return;
                                }
                            }
                        }
                    }
                }

                /* Strategy Exit Condition */

                if (strategyPhase === 1) {

                    checkExitPoints();

                    function checkExitPoints() {

                        let strategy = tradingSystem.strategies[strategyNumber - 1];

                        for (let k = 0; k < strategy.triggerOff.situations.length; k++) {

                            let situation = strategy.triggerOff.situations[k];
                            let passed = true;

                            for (let m = 0; m < situation.conditions.length; m++) {

                                let condition = situation.conditions[m];
                                let key = strategy.name + '-' + situation.name + '-' + condition.name

                                let value = conditions.get(key).value;

                                if (value === false) { passed = false; }
                            }

                            if (passed) {

                                currentStrategy.number = strategyNumber - 1
                                currentStrategy.end = candle.end;
                                currentStrategy.endRate = candle.min;
                                currentStrategy.status = 1;
                                strategyPhase = 0;
                                strategyNumber = 0;

                                return;
                            }
                        }
                    }
                }

                /* Checking if Stop or Take Profit were hit */

                if (strategyPhase === 3) {

                    /* Checking what happened since the last execution. We need to know if the Stop Loss
                        or our Take Profit were hit. */

                    /* Stop Loss condition: Here we verify if the Stop Loss was hitted or not. */

                    if (candle.max >= stopLoss) {

                        balanceAssetA = balanceAssetB / stopLoss;
                        balanceAssetB = 0;

                        if (currentDay !== undefined) {
                            if (positionInstant < currentDay.valueOf()) {
                                yesterday.balanceAssetA = balanceAssetA;
                                yesterday.balanceAssetB = balanceAssetB;
                            }
                        }

                        marketRate = stopLoss;
                        type = '"Buy@StopLoss"';
                        strategyPhase = 4;
                        currentTrade.end = candle.end;
                        currentTrade.status = 1;
                        currentTrade.exitType = 1;
                        currentTrade.endRate = stopLoss;

                        currentStrategy.number = strategyNumber - 1
                        currentStrategy.end = candle.end;
                        currentStrategy.endRate = candle.min;
                        currentStrategy.status = 1;
                    }

                    /* Take Profit condition: Here we verify if the Take Profit was filled or not. */

                    if (candle.min <= takeProfit) {

                        balanceAssetA = balanceAssetB / takeProfit;
                        balanceAssetB = 0;

                        if (currentDay !== undefined) {
                            if (positionInstant < currentDay.valueOf()) {
                                yesterday.balanceAssetA = balanceAssetA;
                                yesterday.balanceAssetB = balanceAssetB;

                            }
                        }

                        marketRate = takeProfit;
                        type = '"Buy@TakeProfit"';
                        strategyPhase = 4;
                        currentTrade.end = candle.end;
                        currentTrade.status = 1;    
                        currentTrade.exitType = 2;
                        currentTrade.endRate = takeProfit;

                        currentStrategy.number = strategyNumber - 1
                        currentStrategy.end = candle.end;
                        currentStrategy.endRate = candle.min;
                        currentStrategy.status = 1;
                    }
                }

                /* Trade Enter Condition */

                if (strategyPhase === 1) {

                    checkTakePosition();

                    function checkTakePosition() {

                        let strategy = tradingSystem.strategies[strategyNumber - 1];

                        for (let k = 0; k < strategy.takePosition.situations.length; k++) {

                            let situation = strategy.takePosition.situations[k];
                            let passed = true;

                            for (let m = 0; m < situation.conditions.length; m++) {

                                let condition = situation.conditions[m];
                                let key = strategy.name + '-' + situation.name + '-' + condition.name

                                let value = conditions.get(key).value;

                                if (value === false) { passed = false; }
                            }

                            if (passed) {

                                type = '"Sell"';

                                strategyPhase = 2;
                                stopLossPhase = 1;
                                takeProfitPhase = 1;
                                currentTrade.begin = candle.begin;
                                currentTrade.beginRate = candle.close;
                                return;
                            }
                        }
                    }
                }

                /* Stop Loss Management */

                if (strategyPhase === 3) {

                    checkStopPhases()
                    checkStopLoss();

                }

                function checkStopPhases() {

                    let strategy = tradingSystem.strategies[strategyNumber - 1];
                    let phase = strategy.stopLoss.phases[stopLossPhase - 1];

                    for (let k = 0; k < phase.situations.length; k++) {

                        let situation = phase.situations[k];
                        let passed = true;

                        for (let m = 0; m < situation.conditions.length; m++) {

                            let condition = situation.conditions[m];
                            let key = strategy.name + '-' + phase.name + '-' + situation.name + '-' + condition.name

                            let value = conditions.get(key).value;

                            if (value === false) { passed = false; }
                        }

                        if (passed) {

                            stopLossPhase++;

                            return;
                        }
                    }
                }

                function checkStopLoss() {

                    let strategy = tradingSystem.strategies[strategyNumber - 1];
                    let phase = strategy.stopLoss.phases[stopLossPhase - 1];

                    try {
                        stopLoss = eval(phase.code); // Here is where we apply the formula given for the stop loss for this phase.
                    } catch (err) {
                        /*
                            If the code produces an exception, we are covered.
                        */
                    }
                    if (isNaN(stopLoss)) { stopLoss = 0; }
                    if (stopLoss < MIN_STOP_LOSS_VALUE) {
                        stopLoss = MIN_STOP_LOSS_VALUE
                    }

                }

                /* Take Profit Management */

                if (strategyPhase === 3) {

                    checkTakeProfitPhases();
                    checkTakeProfit();

                }

                function checkTakeProfitPhases() {

                    let strategy = tradingSystem.strategies[strategyNumber - 1];
                    let phase = strategy.takeProfit.phases[takeProfitPhase - 1];

                    for (let k = 0; k < phase.situations.length; k++) {

                        let situation = phase.situations[k];
                        let passed = true;

                        for (let m = 0; m < situation.conditions.length; m++) {

                            let condition = situation.conditions[m];
                            let key = strategy.name + '-' + phase.name + '-' + situation.name + '-' + condition.name

                            let value = conditions.get(key).value;

                            if (value === false) { passed = false; }
                        }

                        if (passed) {

                            takeProfitPhase++;

                            return;
                        }
                    }
                }

                function checkTakeProfit() {

                    let strategy = tradingSystem.strategies[strategyNumber - 1];
                    let phase = strategy.takeProfit.phases[takeProfitPhase - 1];

                    try {
                        takeProfit = eval(phase.code); // Here is where we apply the formula given for the buy order at this phase.
                    } catch (err) {
                        /*
                            If the code produces an exception, we are covered.
                        */
                    }
                    if (isNaN(takeProfit)) { takeProfit = 0; }
                    if (takeProfit < MIN_TAKE_PROFIT_VALUE) {
                        takeProfit = MIN_TAKE_PROFIT_VALUE
                    }
                }

                /* Entering into a Trade */

                if (strategyPhase === 2) {

                    marketRate = candle.close;
                    positionRate = marketRate;
                    positionSize = balanceAssetA;

                    stopLoss = positionRate + positionRate * 1 / 100;
                    previousStopLoss = stopLoss;

                    checkStopLoss();
                    checkTakeProfit();

                    previousBalanceAssetA = balanceAssetA;
                    lastProfit = 0;
                    lastProfitPercent = 0;

                    balanceAssetB = balanceAssetA * marketRate;
                    balanceAssetA = 0;

                    positionInstant = candle.end;

                    if (currentDay !== undefined) {
                        if (positionInstant < currentDay.valueOf()) {
                            yesterday.balanceAssetA = balanceAssetA;
                            yesterday.balanceAssetB = balanceAssetB;

                            yesterday.lastProfit = lastProfit;
                            yesterday.lastProfitPercent = lastProfitPercent;
                        }
                    }

                    addRecord();

                    strategyPhase = 3;
                    continue;
                }

                /* Exiting a Trade */

                if (strategyPhase === 4) {

                    roundtrips++;

                    if (currentDay !== undefined) {
                        if (positionInstant < currentDay.valueOf()) {
                            yesterday.Roundtrips++;
                        }                        
                    }
                    
                    lastProfit = balanceAssetA - previousBalanceAssetA;
                    lastProfitPercent = lastProfit / previousBalanceAssetA * 100;
                    if (isNaN(lastProfitPercent)) { lastProfitPercent = 0; }
                    profit = balanceAssetA - initialBalanceA;

                    if (currentDay !== undefined) {
                        if (positionInstant < currentDay.valueOf()) {
                            yesterday.lastProfit = lastProfit;
                            yesterday.profit = profit;
                            yesterday.lastProfitPercent = lastProfitPercent;
                        }
                    }

                    currentTrade.lastProfitPercent = lastProfitPercent;
                    currentTrade.stopRate = stopLoss;
                    
                    //if (isNaN(ROI)) { ROI = 0; }

                    if (lastProfit > 0) {
                        hits++;

                        if (currentDay !== undefined) {
                            if (positionInstant < currentDay.valueOf()) {
                                yesterday.hits++;
                            }
                        }

                    } else {
                        fails++;

                        if (currentDay !== undefined) {
                            if (positionInstant < currentDay.valueOf()) {
                                yesterday.fails++;
                            }
                        }
                    }

                    ROI = (initialBalanceA + profit) / initialBalanceA - 1;
                    hitRatio = hits / roundtrips;
                    anualizedRateOfReturn = ROI / days * 365;

                    if (currentDay !== undefined) {
                        if (positionInstant < currentDay.valueOf()) {
                            yesterday.ROI = ROI;
                            yesterday.hitRatio = hitRatio;
                            yesterday.anualizedRateOfReturn = anualizedRateOfReturn;
                        }
                    }


                    addRecord();

                    strategyNumber = 0;
                    stopLoss = 0;
                    positionRate = 0;
                    positionSize = 0;
                    positionInstant = undefined;
                    takeProfit = 0;
                    strategyPhase = 0;
                    stopLossPhase = 0;
                    takeProfitPhase = 0;
                    continue;

                }

                /* Not a buy or sell condition */

                marketRate = candle.close;
                addRecord();

                function addRecord() {

                    // Since we are going to write the message to a file that the Simulation Executor is going to read, we use the abbreviations.
                    let messageType;
                    let message;
                    let simulationRecord;
                    let orderRecord;

                    messageId++;

                    if (strategyPhase === 2 || strategyPhase === 3) {

                        if (strategyPhase === 2) {
                            messageType = MESSAGE_TYPE.Order;
                            orderId++;
                        }
                        if (strategyPhase === 3) {
                            messageType = MESSAGE_TYPE.OrderUpdate;
                        }

                        orderRecord = createMessage(
                        messageId,
                        MESSAGE_ENTITY.SimulationEngine,
                        MESSAGE_ENTITY.SimulationExecutor,
                        messageType,
                        (new Date()).valueOf(),
                        orderId.toString(),
                        ORDER_CREATOR.SimulationEngine,
                        (new Date()).valueOf(),
                        ORDER_OWNER.User,
                        global.EXCHANGE_NAME,
                        "BTC_USDT",
                        0,
                        ORDER_TYPE.Limit,
                        marketRate,
                        stopLoss,
                        takeProfit,
                        ORDER_DIRECTION.Sell,
                        -1,
                        ORDER_STATUS.Signaled,
                        0,
                        "")

                    }
                    else {

                        orderRecord = createMessage(
                        messageId,
                        MESSAGE_ENTITY.SimulationEngine,
                        MESSAGE_ENTITY.SimulationExecutor,
                        MESSAGE_TYPE.HeartBeat,
                        (new Date()).valueOf(),
                        "",
                        "",
                        0,
                        "",
                        "",
                        "",
                        0,
                        "",
                        0,
                        0,
                        0,
                        "",
                        0,
                        "",
                        0,
                        "")
                    }

                    simulationRecord = {
                        begin: candle.begin,
                        end: candle.end,
                        type: type,
                        marketRate: marketRate,
                        amount: 1,
                        balanceA: balanceAssetA,
                        balanceB: balanceAssetB,
                        profit: profit,
                        lastProfit: lastProfit,
                        stopLoss: stopLoss,
                        roundtrips: roundtrips,
                        hits: hits,
                        fails: fails,
                        hitRatio: hitRatio,
                        ROI: ROI,
                        periods: periods,
                        days: days,
                        anualizedRateOfReturn: anualizedRateOfReturn,
                        positionRate: positionRate,
                        lastProfitPercent: lastProfitPercent,
                        strategy: strategyNumber,
                        strategyPhase: strategyPhase,
                        takeProfit: takeProfit,
                        stopLossPhase: stopLossPhase,
                        takeProfitPhase: takeProfitPhase,
                        orderRecord: orderRecord,
                        positionSize: positionSize
                    }

                    recordsArray.push(simulationRecord);

                    previousStopLoss = stopLoss;

                    type = '""';

                    /* Prepare the information for the Conditions File */

                    conditionsArrayRecord.push(strategyNumber);
                    conditionsArrayRecord.push(strategyPhase);
                    conditionsArrayRecord.push(stopLossPhase);
                    conditionsArrayRecord.push(takeProfitPhase);
                    conditionsArrayRecord.push(conditionsArrayValues);

                    conditionsArray.push(conditionsArrayRecord);

                    /* Prepare the information for the Strategies File*/

                    if (
                        (currentStrategy.begin !== 0 && currentStrategy.end !== 0) ||
                        (currentStrategy.begin !== 0 && i === candles.length - 1 && lastCandle.end !== lastInstantOfTheDay)
                    ) {

                        strategiesArray.push(currentStrategy);

                        currentStrategy = {
                            begin: 0,
                            end: 0,
                            status: 0,
                            number: 0,
                            beginRate: 0,
                            endRate: 0
                        }
                    }

                    /* Prepare the information for the Trades File */

                    if (
                        (currentTrade.begin !== 0 && currentTrade.end !== 0) ||
                        (currentTrade.begin !== 0 && i === candles.length - 1 && lastCandle.end !== lastInstantOfTheDay)
                    ) {

                        currentTrade.profit = lastProfit;

                        tradesArray.push(currentTrade);

                        currentTrade = {
                            begin: 0,
                            end: 0,
                            status: 0,
                            lastProfitPercent: 0,
                            exitType: 0,
                            beginRate: 0,
                            endRate: 0
                        }
                    }
                }
            }

            /*
            Before returning we need to see if we have to record some of our counters at the interExecutionMemory.
            To do that, the condition to be met is that this execution must include all candles of the currentDay.
            */

            if (currentDay !== undefined) {

                if (lastCandle.end === lastInstantOfTheDay) {

                    interExecutionMemory.balanceAssetA = yesterday.balanceAssetA;
                    interExecutionMemory.balanceAssetB = yesterday.balanceAssetB;
                    interExecutionMemory.lastProfit = yesterday.lastProfit;
                    interExecutionMemory.profit = yesterday.profit;
                    interExecutionMemory.lastProfitPercent = yesterday.lastProfitPercent;

                    interExecutionMemory.roundtrips = interExecutionMemory.roundtrips + yesterday.Roundtrips;
                    interExecutionMemory.fails = interExecutionMemory.fails + yesterday.fails;
                    interExecutionMemory.hits = interExecutionMemory.hits + yesterday.hits;
                    interExecutionMemory.periods = interExecutionMemory.periods + yesterday.Periods;

                    interExecutionMemory.messageId = interExecutionMemory.messageId + yesterday.messageId;
                    interExecutionMemory.orderId = interExecutionMemory.orderId + yesterday.orderId;

                    interExecutionMemory.hitRatio = yesterday.hitRatio;
                    interExecutionMemory.ROI = yesterday.ROI;
                    interExecutionMemory.anualizedRateOfReturn = yesterday.anualizedRateOfReturn;
                }
            }

            callback();

            function getElement(pArray, begin, end) {

                let element;

                for (let i = 0; i < pArray.length; i++) {

                    element = pArray[i];

                    if (begin >= element.begin && end <= element.end) {
                        return element
                    }
                }

                element = {
                    direction: 'unknown',
                    slope: 'unknown'
                };
                return element;
            }
        }
        catch (err) {
            logger.write(MODULE_NAME, "[ERROR] runSimulation -> err = " + err.stack);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function evaluateConditions(tradingSystem, conditions) {

        for (let j = 0; j < tradingSystem.strategies.length; j++) {

            let strategy = tradingSystem.strategies[j];

            let triggerStage = strategy.triggerStage

            if (triggerStage !== undefined) {

                for (let k = 0; k < triggerStage.triggerOn.situations.length; k++) {

                    let situation = triggerStage.triggerOn.situations[k];

                    for (let m = 0; m < situation.conditions.length; m++) {

                        let condition = situation.conditions[m];
                        let key = j + '-' + 'triggerStage' + '-' + 'triggerOn' + '-' + k + '-' + m;

                        newCondition(key, condition.code);
                    }
                }

                for (let k = 0; k < triggerStage.triggerOff.situations.length; k++) {

                    let situation = triggerStage.triggerOff.situations[k];

                    for (let m = 0; m < situation.conditions.length; m++) {

                        let condition = situation.conditions[m];
                        let key = j + '-' + 'triggerStage' + '-' + 'triggerOff' + '-' + k + '-' + m;

                        newCondition(key, condition.code);
                    }
                }

                for (let k = 0; k < triggerStage.takePosition.situations.length; k++) {

                    let situation = triggerStage.takePosition.situations[k];

                    for (let m = 0; m < situation.conditions.length; m++) {

                        let condition = situation.conditions[m];
                        let key = j + '-' + 'triggerStage' + '-' + 'takePosition' + '-' + k + '-' + m;

                        newCondition(key, condition.code);
                    }
                }
            }

            let openStage = strategy.openStage

            if (openStage !== undefined) {

                let initialDefinition = openStage.initialDefinition

                if (initialDefinition !== undefined) {

                    for (let p = 0; p < initialDefinition.stopLoss.phases.length; p++) {

                        let phase = initialDefinition.stopLoss.phases[p];

                        for (let k = 0; k < phase.situations.length; k++) {

                            let situation = phase.situations[k];

                            for (let m = 0; m < situation.conditions.length; m++) {

                                let condition = situation.conditions[m];
                                let key = j + '-' + 'openStage' + '-' + 'initialDefinition' + '-' + 'stopLoss' + '-' + p + '-' + k + '-' + m;

                                newCondition(key, condition.code);
                            }
                        }
                    }

                    for (let p = 0; p < initialDefinition.takeProfit.phases.length; p++) {

                        let phase = initialDefinition.takeProfit.phases[p];

                        for (let k = 0; k < phase.situations.length; k++) {

                            let situation = phase.situations[k];

                            for (let m = 0; m < situation.conditions.length; m++) {

                                let condition = situation.conditions[m];
                                let key = j + '-' + 'openStage' + '-' + 'initialDefinition' + '-' + 'takeProfit' + '-' + p + '-' + k + '-' + m;

                                newCondition(key, condition.code);
                            }
                        }
                    }
                }
            }

            let manageStage = strategy.manageStage

            if (manageStage !== undefined) {

                for (let p = 0; p < manageStage.stopLoss.phases.length; p++) {

                    let phase = manageStage.stopLoss.phases[p];

                    for (let k = 0; k < phase.situations.length; k++) {

                        let situation = phase.situations[k];

                        for (let m = 0; m < situation.conditions.length; m++) {

                            let condition = situation.conditions[m];
                            let key = j + '-' + 'manageStage' + '-' + 'stopLoss' + '-' + p + '-' + k + '-' + m;

                            newCondition(key, condition.code);
                        }
                    }
                }

                for (let p = 0; p < manageStage.takeProfit.phases.length; p++) {

                    let phase = manageStage.takeProfit.phases[p];

                    for (let k = 0; k < phase.situations.length; k++) {

                        let situation = phase.situations[k];

                        for (let m = 0; m < situation.conditions.length; m++) {

                            let condition = situation.conditions[m];
                            let key = j + '-' + 'manageStage' + '-' + 'takeProfit' + '-' + p + '-' + k + '-' + m;

                            newCondition(key, condition.code);
                        }
                    }
                }
            }
        }

        function newCondition(key, code) {

            let condition;
            let value = false;

            try {
                value = eval(code);
            } catch (err) {
                /*
                    One possible error is that the conditions references a .previous that is undefined. For this
                    reason and others, we will simply set the value to false.
                */
                value = false
            }

            condition = {
                key: key,
                value: value
            };

            conditions.set(condition.key, condition);

            if (condition.value) {
                conditionsArrayValues.push(1);
            } else {
                conditionsArrayValues.push(0);
            }
        }

    }

    function buildLRC(dataFile, callBackFunction) {

        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] buildLRC -> Entering function."); }

        try {

            let previous;

            for (let i = 0; i < dataFile.length; i++) {

                let LRC = {
                    begin: dataFile[i][0],
                    end: dataFile[i][1],
                    _15: dataFile[i][2],
                    _30: dataFile[i][3],
                    _60: dataFile[i][4]
                };

                if (previous !== undefined) {

                    if (previous._15 > LRC._15) { LRC.direction15 = 'down'; }
                    if (previous._15 < LRC._15) { LRC.direction15 = 'up'; }
                    if (previous._15 === LRC._15) { LRC.direction15 = 'side'; }

                    if (previous._30 > LRC._30) { LRC.direction30 = 'down'; }
                    if (previous._30 < LRC._30) { LRC.direction30 = 'up'; }
                    if (previous._30 === LRC._30) { LRC.direction30 = 'side'; }

                    if (previous._60 > LRC._60) { LRC.direction60 = 'down'; }
                    if (previous._60 < LRC._60) { LRC.direction60 = 'up'; }
                    if (previous._60 === LRC._60) { LRC.direction60 = 'side'; }

                }

                LRC.previous = previous;

                LRCMap.set(LRC.begin, LRC);

                previous = LRC;
            }
        }
        catch (err) {
            logger.write(MODULE_NAME, "[ERROR] buildLRC -> err = " + err.stack);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function buildPercentageBandwidthMap(dataFile, callBackFunction) {

        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] buildPercentageBandwidthMap -> Entering function."); }

        try {

            let previous;

            for (let i = 0; i < dataFile.length; i++) {

                let percentageBandwidth = {
                    begin: dataFile[i][0],
                    end: dataFile[i][1],
                    value: dataFile[i][2],
                    movingAverage: dataFile[i][3],
                    bandwidth: dataFile[i][4]
                };

                if (previous !== undefined) {

                    if (previous.movingAverage > percentageBandwidth.movingAverage) { percentageBandwidth.direction = 'down'; }
                    if (previous.movingAverage < percentageBandwidth.movingAverage) { percentageBandwidth.direction = 'up'; }
                    if (previous.movingAverage === percentageBandwidth.movingAverage) { percentageBandwidth.direction = 'side'; }

                }

                percentageBandwidth.previous = previous;

                percentageBandwidthMap.set(percentageBandwidth.begin, percentageBandwidth);

                previous = percentageBandwidth;
            }
        }
        catch (err) {
            logger.write(MODULE_NAME, "[ERROR] buildPercentageBandwidthMap -> err = " + err.stack);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function buildBollingerBandsMap(dataFile, callBackFunction) {

        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] buildBollingerBandsMap -> Entering function."); }

        try {

            let previous;

            for (let i = 0; i < dataFile.length; i++) {

                let bollingerBand = {
                    begin: dataFile[i][0],
                    end: dataFile[i][1],
                    movingAverage: dataFile[i][2],
                    standardDeviation: dataFile[i][3],
                    deviation: dataFile[i][4]
                };

                if (previous !== undefined) {

                    if (previous.movingAverage > bollingerBand.movingAverage) { bollingerBand.direction = 'down'; }
                    if (previous.movingAverage < bollingerBand.movingAverage) { bollingerBand.direction = 'up'; }
                    if (previous.movingAverage === bollingerBand.movingAverage) { bollingerBand.direction = 'side'; }

                }

                bollingerBand.previous = previous;

                bollingerBandsMap.set(bollingerBand.begin, bollingerBand);

                previous = bollingerBand;
            }
        }
        catch (err) {
            logger.write(MODULE_NAME, "[ERROR] buildBollingerBandsMap -> err = " + err.stack);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function buildBollingerChannelsArray(dataFile, callBackFunction) {

        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] buildBollingerChannelsArray -> Entering function."); }

        try {

            let previous;

            for (let i = 0; i < dataFile.length; i++) {

                let bollingerChannel = {
                    begin: dataFile[i][0],
                    end: dataFile[i][1],
                    direction: dataFile[i][2],
                    period: dataFile[i][3],
                    firstMovingAverage: dataFile[i][4],
                    lastMovingAverage: dataFile[i][5],
                    firstDeviation: dataFile[i][6],
                    lastDeviation: dataFile[i][7]
                };

                bollingerChannel.previous = previous;

                bollingerChannelsArray.push(bollingerChannel);

                previous = bollingerChannel;
            }
        }
        catch (err) {
            logger.write(MODULE_NAME, "[ERROR] buildBollingerChannelsArray -> err = " + err.stack);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function buildBollingerSubChannelsArray(dataFile, callBackFunction) {

        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] buildBollingerSubChannelsArray -> Entering function."); }

        try {

            let previous;

            for (let i = 0; i < dataFile.length; i++) {

                let bollingerSubChannel = {
                    begin: dataFile[i][0],
                    end: dataFile[i][1],
                    direction: dataFile[i][2],
                    slope: dataFile[i][3],
                    period: dataFile[i][4],
                    firstMovingAverage: dataFile[i][5],
                    lastMovingAverage: dataFile[i][6],
                    firstDeviation: dataFile[i][7],
                    lastDeviation: dataFile[i][8]
                };

                bollingerSubChannel.previous = previous;

                bollingerSubChannelsArray.push(bollingerSubChannel);

                previous = bollingerSubChannel;
            }
        }
        catch (err) {
            logger.write(MODULE_NAME, "[ERROR] buildBollingerSubChannelsArray -> err = " + err.stack);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function buildCandles(dataFile, callBackFunction) {

        if (FULL_LOG === true) { logger.write(MODULE_NAME, "[INFO] buildCandles -> Entering function."); }

        try {

            let previous;

            for (let i = 0; i < dataFile.length; i++) {

                let candle = {
                    open: undefined,
                    close: undefined,
                    min: 10000000000000,
                    max: 0,
                    begin: undefined,
                    end: undefined,
                    direction: undefined
                };

                candle.min = dataFile[i][0];
                candle.max = dataFile[i][1];

                candle.open = dataFile[i][2];
                candle.close = dataFile[i][3];

                candle.begin = dataFile[i][4];
                candle.end = dataFile[i][5];

                if (candle.open > candle.close) { candle.direction = 'down'; }
                if (candle.open < candle.close) { candle.direction = 'up'; }
                if (candle.open === candle.close) { candle.direction = 'side'; }

                candle.previous = previous;

                candles.push(candle);

                previous = candle;
            }
        }
        catch (err) {
            logger.write(MODULE_NAME, "[ERROR] buildCandles -> err = " + err.stack);
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    async function getStrategies() {

        try {

            const accessToken = await auth.authenticate()

            let fbSlug = bot.codeName
            if (process.env.TEST_FB !== undefined) {
                fbSlug = process.env.TEST_FB
            }

            const strategizerResponse = await axios({
                url: process.env.GATEWAY_ENDPOINT,
                method: 'post',
                data: {
                    query: `
                    query($fbSlug: String!){
                      strategizer_TradingSystemByFb(fbSlug: $fbSlug){
                        id
                        fbSlug
                        data
                      }
                    }
                `,
                    variables: {
                        fbSlug: fbSlug
                    },
                },
                headers: {
                    authorization: 'Bearer ' + accessToken
                }
            })

            if (strategizerResponse.data.errors)
                throw new Error(strategizerResponse.data.errors[0].message)

            return strategizerResponse.data.data.strategizer_TradingSystemByFb.data.strategies;

        } catch (error) {
            throw new Error('There has been an error getting the strategy to run on the simulator. Error: ' + error)
        }
    }
};



