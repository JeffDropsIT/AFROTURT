const auth = require("./authentication");
const awsHandler = require('../../aws/aws-handler');
const generic = require("./generic");
const counters = require("./counters");
const schema = require("./schema/schema");
const ObjectId = require('mongodb').ObjectID;
const empty = require("is-empty");




// CRUD  salon 
//at least one services is required to create a salon
const createSalon = async (userId, name, address, street, coordinates, sName, hiring) =>{
    try {
            //add this to users db
        console.log("--createSalon--");
        const salonId = await counters.getNextSequenceValue("salonId", "salonIndexes")
        const salon = await schema.createNewSalonForm(salonId,name, address, street, coordinates, sName);
        let _id;
        
        const addedSalon = await generic.insertIntoCollection("afroturf", "salons",salon);
        _id = addedSalon.ok == 1 ?  addedSalon._id: null;


        //if successful
        if(_id !== null){
            addSalonToUserAccount(userId, _id, hiring, salonId);
            console.log("Creating users chat room. . .and reviewsDoc");
            createOrderDoc(userId, _id)
            generic.createNewUsersPrivateChatRoom(_id, name, "salons");
            awsHandler.createUserDefaultBucket(name).then(p => updateSalon({bucketName: p}, _id));
            generic.createReviewsDoc(_id, "salons");
            console.log("--added to owner account-- "+_id);
            return 200;
        }else{
            console.log("--failed to add owner account--");
            return -1
    }
    } catch (error) {
        throw new Error(error);
    }


    
 

}

const findOwner = async(salonObjId) =>{
    const db = await generic.getDatabaseByName("afroturf");
    const salonCursor = await db.db.collection("users").find({
        "salons.salonObjId": salonObjId
    }).project({orderDocList:1, reviewsDocId: 1, roomDocIdList:1, bucketName:1, username:1});;
    const salon = await salonCursor.toArray();
 
      
    db.connection.close();
    console.log(JSON.parse(JSON.stringify(salon[0])));

    return JSON.parse(JSON.stringify(salon[0]));
}
//test
//findOwner("5b8902930548d434f87ad900");

const getOrderSalonDoc = async (salonObjId) => {
    const db = await generic.getDatabaseByName("afroturf");
    const salonCursor = await db.db.collection("users").aggregate([
        {$match : {"salons.salonObjId": salonObjId}},
        {
            $project: {
                orderDocList: {
                   $filter: {
                      input: "$orderDocList",
                      as: "this",
                      cond:{$eq : [  "$$this.salonObjId", salonObjId ]}
                   }
                }
             }
        }
    ])
    const salon = await salonCursor.toArray();
    
    if(!empty(salon)){
        console.log("DATA IS THERE. . . ")
        console.log(salon)
        let count = JSON.parse(JSON.stringify(salon[0]));
        db.connection.close();
        console.log("GET ORDERSLIST")
        console.log(count.orderDocList[0])
        return count.orderDocList[0];
    }
}
//test
//getOrderSalonDoc("5b8902930548d434f87ad900");

//addtosalonOrders
const addtosalonOrders = async(userId, salonObjId) => {
    //look up salon owner
    const orderDocObj = await getOrderSalonDoc(salonObjId);
    const data = {
        orderId: "salon-"+await counters.getOrderNumber(orderDocObj.orderDoc,"$salonOrders"),
        customerId: userId,
        serviceName: "haircuts",
        salonObjId:salonObjId,
        code: "F23M",
        price: 100,
        description: "Faded haircut :)",
        timeSlot: new Date('August 30, 2018 19:15:30')
    }
    console.log("--addtosalonOrders--");
    const salonOrder = await schema.salonOrder(data);
    const res = await addBookingUserAccount(userId, data);
    if(res.ok!==1 && res.nModified!==1){
        console.log(401 + "Failed to add booking to user account");
        return 401 + "Failed to add booking to user account"
    }else{
        console.log(salonOrder);
        try{
            const db = await generic.getDatabaseByName("afroturf");
            const result = await db.db.collection("orders").update(
                {"_id": ObjectId(orderDocObj.orderDoc,)},
                {$addToSet: {salonOrders:salonOrder}}, 
            );
            db.connection.close();
            console.log(result.result.ok, result.result.nModified);
        return  result.result.ok, result.result.nModified;
        }catch(err){
            throw new Error(err);
        }
    }

}
//test
//addtosalonOrders("5b7e8d6291de652110e648ca","5b8902930548d434f87ad900");

const getSalonOrdersByDateAfter = async(salonObjId, date) => {
    const db = await generic.getDatabaseByName("afroturf");
    const salonCursor = await db.db.collection("orders").aggregate([
        {$match : {"salonObjId": salonObjId}},
        {
            $project: {
                salonOrders:{
                    $filter: {
                        input: "$salonOrders",
                        as: "this",
                        cond:{$and : [{$gte : ["$$this.created", new Date(date)] }]}
                     }
                }
             }
        }
    ])
    const salon = await salonCursor.toArray();
    
    if(!empty(salon)){
        console.log("DATA IS THERE. . . ")
        console.log(salon)
        let count = JSON.parse(JSON.stringify(salon));
        db.connection.close();        
        return count;
    }
    db.connection.close();
}
//test
//getSalonOrdersByDateAfter("5b8902930548d434f87ad900", "August 29, 2018 19:15:30")


const getSalonOrdersByDateBefore = async(salonObjId, date) => {
    const db = await generic.getDatabaseByName("afroturf");
    const salonCursor = await db.db.collection("orders").aggregate([
        {$match : {"salonObjId": salonObjId}},
        {
            $project: {
                salonOrders:{
                    $filter: {
                        input: "$salonOrders",
                        as: "this",
                        cond:{$and : [{$lte : ["$$this.created", new Date(date)] }]}
                     }
                }
             }
        }
    ])
    const salon = await salonCursor.toArray();
    
    if(!empty(salon)){
        console.log("DATA IS THERE. . . ")
        console.log(salon)
        let count = JSON.parse(JSON.stringify(salon));
        db.connection.close();        
        return count;
    }
    db.connection.close();
}
//test
//getSalonOrdersByDateBefore("5b8902930548d434f87ad900", "August 31, 2018 19:15:30")


const getSalonOrdersByDateBetween = async(salonObjId, date, date2) => {
    const db = await generic.getDatabaseByName("afroturf");
    const salonCursor = await db.db.collection("orders").aggregate([
        {$match : {"salonObjId": salonObjId}},
        {
            $project: {
                salonOrders:{
                    $filter: {
                        input: "$salonOrders",
                        as: "this",
                        cond:{$and : [{$lte : ["$$this.created", new Date(date2)] }, {$gte : ["$$this.created", new Date(date)] }]}
                     }
                }
             }
        }
    ])
    const salon = await salonCursor.toArray();
    
    if(!empty(salon)){
        console.log("DATA IS THERE. . . ")
        console.log(salon)
        let count = JSON.parse(JSON.stringify(salon));
        db.connection.close();        
        return count;
    }
    db.connection.close();
}
//test
//getSalonOrdersByDateBetween("5b8902930548d434f87ad900", "August 31, 2018 18:15:30", "August 31, 2018 20:15:30" )
//addtostylistOrders



const addBookingUserAccount = async(userId, data) =>{
    try{
        const booking = await schema.booking(data);
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("users").update(
            {"_id": ObjectId(userId)},
            {$addToSet: {booking:booking}}, 
        );
        db.connection.close();
        console.log(result.result.ok, result.result.nModified);
    return  {ok: result.result.ok, nModified: result.result.nModified};
    }catch(err){
        throw new Error(err);
    }

}

const addtostylistOrders = async(userId, salonObjId) => {
    //look up salon owner
    const orderDocObj = await getOrderSalonDoc(salonObjId);
    const data = {
        orderId: "stylist-"+ await counters.getOrderNumber(orderDocObj.orderDoc,"$stylistOrders"),
        customerId: userId,
        serviceName: "haircuts",
        code: "F23M",
        price: 100,
        salonObjId:salonObjId,
        assignedTo: "stylistIdGoesHere",
        description: "Faded haircut :)",
        timeSlot: new Date('August 30, 2018 19:15:30')
    }
    console.log("--addtosalonOrders--");
    const salonOrder = await schema.stylistOrder(data);
    const res = await addBookingUserAccount(userId, data);
    if(res.ok!==1 && res.nModified!==1){
        console.log(401 + "Failed to add booking to user account");
        return 401 + "Failed to add booking to user account"
    }else{
        
        console.log(salonOrder);
        try{
            const db = await generic.getDatabaseByName("afroturf");
            const result = await db.db.collection("orders").update(
                {"_id": ObjectId(orderDocObj.orderDoc)},
                {$addToSet: {stylistOrders:salonOrder}}, 
            );
            db.connection.close();
            console.log(result.result.ok, result.result.nModified);
        return  result.result.ok, result.result.nModified;
        }catch(err){
            throw new Error(err);
        }
    }

}
//test
//addtosalonOrders("5b7e8d6291de652110e648ca","5b8902930548d434f87ad900");

const getOrderByOrderNumber = async(orderNumber, salonObjId) =>{
    const db = await generic.getDatabaseByName("afroturf");
    const salonCursor = await db.db.collection("orders").aggregate([
        {$match : {$and : [{salonObjId:salonObjId},{$or:[{"salonOrders.orderId": orderNumber}, {"stylistOrders.orderId": orderNumber}]}]}},
        {
            $project: {
                stylistOrders:{
                    $filter: {
                        input: "$stylistOrders",
                        as: "this",
                        cond:{$and : [{$eq : ["$$this.orderId",orderNumber ]}]}
                     }
                }
             }
        }
    ])
    const salon = await salonCursor.toArray();
    
    if(!empty(salon)){
        console.log("OrderByNumber. . . ")
        console.log(salon)
        let count = JSON.parse(JSON.stringify(salon));
        db.connection.close();        
        return count;
    }
    db.connection.close();
}

//test
//getOrderByOrderNumber("stylist-1","5b8902930548d434f87ad900");

const acceptOrder = async (data) =>{


    console.log("--acceptOrder--");
    try{
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("orders").updateOne(
            { "salonObjId": data.salonObjId,salonOrders:{$elemMatch :{"orderId": data.orderId}}},
            {$set: {"salonOrders.$":data}}, 
        );
        console.log(result.result.ok, result.result.nModified);
        const res = { ok: result.result.ok, nModified:result.result.nModified};

        if(res.ok === 1 && res.nModified === 1){
            const result2 = await db.db.collection("users").updateOne(
                { "booking.salonObjId": data.salonObjId,booking:{$elemMatch :{"orderId": data.orderId}}},
                {$set: {booking:data}}, 
            );
            db.connection.close();
            console.log(result2.result.ok, result2.result.nModified);
            return  { ok: result2.result.ok, nModified:result2.result.nModified};

        }
        db.connection.close();
    
    }catch(err){
        throw new Error(err);
    }

}
//test
const data  = {
    "orderId": "salon-3",
    "customerId": "data.customerId",
    "item": "haircuts",
    "code": "F23M",
    "price": 100,
    "salonObjId": "5b8902930548d434f87ad900",
    "description": "Faded haircut :)",
    "status": "pending",
    "assigned": true,
    "assignedTo": "to some stylist",
    "approved": true,
    "available": true,
    "cancelled": false
}
acceptOrder(data);


const getStylistOrdersByDateAfter = async(salonObjId, date) => {
    const db = await generic.getDatabaseByName("afroturf");
    const salonCursor = await db.db.collection("orders").aggregate([
        {$match : {"salonObjId": salonObjId}},
        {
            $project: {
                stylistOrders:{
                    $filter: {
                        input: "$stylistOrders",
                        as: "this",
                        cond:{$and : [{$gte : ["$$this.created", new Date(date)] }]}
                     }
                }
             }
        }
    ])
    const salon = await salonCursor.toArray();
    
    if(!empty(salon)){
        console.log("DATA IS THERE. . . ")
        console.log(salon)
        let count = JSON.parse(JSON.stringify(salon));
        db.connection.close();        
        return count;
    }
    db.connection.close();
}
//test
//getStylistOrdersByDateAfter("5b8902930548d434f87ad900", "August 29, 2019 19:15:30")


const getStylistOrdersByDateBefore = async(salonObjId, date) => {
    const db = await generic.getDatabaseByName("afroturf");
    const salonCursor = await db.db.collection("orders").aggregate([
        {$match : {"salonObjId": salonObjId}},
        {
            $project: {
                stylistOrders:{
                    $filter: {
                        input: "$stylistOrders",
                        as: "this",
                        cond:{$and : [{$lte : ["$$this.created", new Date(date)] }]}
                     }
                }
             }
        }
    ])
    const salon = await salonCursor.toArray();
    
    if(!empty(salon)){
        console.log("DATA IS THERE. . . ")
        console.log(salon)
        let count = JSON.parse(JSON.stringify(salon));
        db.connection.close();        
        return count;
    }
    db.connection.close();
}
//test
//getStylistOrdersByDateBefore("5b8902930548d434f87ad900", "August 10, 2018 19:15:30")


const getStylistOrdersByDateBetween = async(salonObjId, date, date2) => {
    const db = await generic.getDatabaseByName("afroturf");
    const salonCursor = await db.db.collection("orders").aggregate([
        {$match : {"salonObjId": salonObjId}},
        {
            $project: {
                stylistOrders:{
                    $filter: {
                        input: "$stylistOrders",
                        as: "this",
                        cond:{$and : [{$lte : ["$$this.created", new Date(date2)] }, {$gte : ["$$this.created", new Date(date)] }]}
                     }
                }
             }
        }
    ])
    const salon = await salonCursor.toArray();
    
    if(!empty(salon)){
        console.log("DATA IS THERE. . . ")
        console.log(salon)
        let count = JSON.parse(JSON.stringify(salon));
        db.connection.close();        
        return count;
    }
    db.connection.close();
}
//test
//getStylistOrdersByDateBetween("5b8902930548d434f87ad900", "August 30, 2018 18:15:30", "August 31, 2018 20:15:30" )

const getSalonOrdersDoc = async(salonObjId) => {
    const db = await generic.getDatabaseByName("afroturf");
    const salonCursor = await db.db.collection("orders").aggregate([
        {$match : {"salonObjId": salonObjId}},
        {
            $project: {
                stylistOrders: 1, salonOrders:1, salonObjId:1
             }
        }
    ])
    const salon = await salonCursor.toArray();
    
    if(!empty(salon)){
        console.log("DATA IS THERE. . . ")
        console.log(salon)
        let count = JSON.parse(JSON.stringify(salon[0]));
        db.connection.close();
        console.log("GET ORDERSLIST")
        console.log(count)
        return count;
    }
}



const createOrderDoc = async (userId, salonObjId) => {
    //get currect user
   
    console.log("--createOrderDoc--");
    const data = await schema.createNewOrder(salonObjId);
    console.log(data);

        //add this to users db
    console.log("--createOrderDoc--");

    let _id;
    
    const addedSalon = await generic.insertIntoCollection("afroturf", "orders",data);
    _id = addedSalon.ok == 1 ?  addedSalon._id: null;


    //if successful
    if(_id !== null){
        addOrderDocToUserAccount(userId, _id, salonObjId);
        return 200;
    }else{
        console.log("--failed to add owner account orders Doc--");
        return -1
    }
    
}
const addOrderDocToUserAccount = async (userId, orderDoc, salonObjId) => {
    //get currect user
    console.log("--addOrderDocToUserAccount--");
    try{
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("users").update(
            {"_id": ObjectId(userId)},
            {$addToSet: {orderDocList:{orderDoc:orderDoc, salonObjId:salonObjId}}}, 
        );
        db.connection.close();
        console.log(result.result.ok, result.result.nModified);
    return  result.result.ok, result.result.nModified;
    }catch(err){
        throw new Error(err);
    }
}

const addSalonToUserAccount = async (userId, salonObjId, hiring, salonId) => {
    //get currect user
    console.log("--addSalonToUserAccount--");
    const data = schema.getActiveSalonsJsonForm(salonId,salonObjId, hiring);
    try{
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("users").update(
            {"_id": ObjectId(userId)},
            {$addToSet: {salons:data}}, 
        );
        db.connection.close();
        console.log(result.result.ok, result.result.nModified);
    return  result.result.ok, result.result.nModified;
    }catch(err){
        throw new Error(err);
    }
}

const updateSalon = async (salonData, salonObjId) =>{
    //put object to update in a salon
    try{
        const salonObjId = ctx.request.salonObjId, salonData = ctx.request.body;
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("salons").update(
            {"_id": ObjectId(salonObjId)},
            {$set: salonData}
        );
        
        db.connection.close();
        console.log(result.result.ok, result.result.nModified);
    return  result.result.ok, result.result.nModified;
    }catch(err){
        throw new Error(err);
    }
}
const changeAccountStatusSalon = async (salonObjId, status) => {
    //change accountStatus to deactivated
    try{
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("salons").update(
            {"_id": ObjectId(salonObjId)},
            {$set: {accountStatus: status}}, 
        );
        db.connection.close();
        console.log(result.result.ok, result.result.nModified);
    return  result.result.ok, result.result.nModified;
    }catch(err){
        throw new Error(err);
    }

}
// CRUD services i.e manicure, pedicure, massages, makeup and hairstyles

const changeServiceName = async (serviceName, name) =>{
    //update service
    try{
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("salons").update(
            {$and: [{"_id": ObjectId(salonObjId)}, {"services._id": serviceName}]},
            {"services.name":name, "services._id":name}
        );
        db.connection.close();
        console.log("ok: "+result.result.ok, "modified: "+ result.result.nModified);
    return  result.result.ok, result.result.nModified;
    }catch(err){
        throw new Error(err);
    }

}
const deleteService = async (serviceName) => {
    //later use $unset
}

const addServicesToSalon = async (salonObjId, serviceName) => {
    //check if service already exist if not proceed
    //get currect user
    console.log("--addServicesToSalon--");
    const data = await schema.createNewServicesForm(serviceName);
    try{
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("salons").update(
            {$and: [{"_id": ObjectId(salonObjId)}, {"services._id": {$ne: serviceName}}]},
            {$addToSet: {services:data}}, 
        );
        db.connection.close();
        console.log("ok: "+result.result.ok, "modified: "+ result.result.nModified);
    return  result.result.ok, result.result.nModified;
    }catch(err){
        throw new Error(err);
    }
}

const addsubserviceToSalonServices = async (salonObjId, serviceName, type, code, price, description) => {
    //get currect user
    console.log("--addsubserviceToSalonServices--");
    const data = schema.createNewSubserviceForm(type, code, price, description);
    try{
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("salons").update(
            {$and : [{"_id": ObjectId(salonObjId)}]},
            {$addToSet: {"services.$[subservice].subservices":data}},
            {arrayFilters: [{$and: [{"subservice._id":serviceName}, {"subservice.subservices.code": {$ne:data.code}}]}]}
        );
        db.connection.close();
        console.log("ok: "+result.result.ok, "modified: "+ result.result.nModified);
    return  result.result.ok, result.result.nModified;
    }catch(err){
        db.connection.close();
        throw new Error(err);
    }
}

const acceptStylistRequest = async (ctx) => {
    try{
        const userId = ctx.query.userId, 
        salonObjId = ctx.query.salonObjId,
        status = ctx.query.status,
        permissions = ctx.query.permissions;
        if(status == undefined || permissions === undefined){return 401 + "status: null or permission: null"}

        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("users").update({
            $and:[{"salons.salonObjId": salonObjId}, {"salons.role": "salonOwner"}]},
            {$set: {"stylistRequests.$[stylist].status":status, "stylistRequests.$[stylist].stylistAccess":[permissions]}},
            {arrayFilters: [{$and: [{"stylist.salonObjId": salonObjId}, {"stylist.userId": userId}]}], multi : true } 
        );
        db.connection.close();
        console.log("ok: "+result.result.ok, "modified: "+ result.result.nModified);
        if(result.result.ok === 1 && result.result.nModified === 1){
            const res = await addStylistToSalon(userId, salonObjId);
            return  res.ok,res.nModified;
        }else{
            return  401 + " error accepting";
        }
        
    }catch(err){
        throw new Error(err);
    }
}



const addStylistToSalon = async (userId, salonObjId) => {
    const stylist = await getUser(userId);
    //console.log()
    let stylistId = await counters.getNextStylistInCount(salonObjId);
    stylistId = stylistId;

    if(stylist == "[]"){
        console.log("   NO SUCH USER "+stylist)
        return -1;
    }
    console.log(" SUCH USER "+stylist[0]._id)
    try{
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("salons").update({
            $and:[{_id: ObjectId(salonObjId)}, {"stylists.userId": {$ne: stylist[0]._id}}]},
            {$addToSet: {stylists:schema.stylistJSON(stylist[0], stylistId, stylist[0]._id )}}
        );
        db.connection.close();
        console.log("ok: "+result.result.ok, "modified: "+ result.result.nModified);
        return  {ok : result.result.ok, nModified:  result.result.nModified}
    }catch(err){
        throw new Error(err);
    }
}

const getUser = async (userId)=>{
    try{
        const db = await generic.getDatabaseByName("afroturf");
        const result = await db.db.collection("users").aggregate([{$match: {_id:ObjectId(userId)} }, {$project: {username:1, fname:1, reviewsDocId:1, gender:1, avatar:1}}]).toArray();
        db.connection.close();
       
        return  JSON.parse(JSON.stringify(result));
    }catch(err){
        throw new Error(err);
    }
}

//createSalon("5b7dd26c21a41857ccfcd7a2", "THE MILE", "Pretoria, 0083, The Blue Street", "The BLue Street", [31.212121,22.12313], "manicure", 1)
module.exports ={
    createSalon,
    updateSalon,
    acceptStylistRequest
}