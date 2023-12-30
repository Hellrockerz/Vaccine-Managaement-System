const staticModel = require("../models/staticModel");

async function staticList(req, res) {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
    
        const options = {
          page,
          limit,
        };
    
        const result = await staticModel.paginate({status: "ACTIVE"}, options);
    
        const staticData = result.docs;
    
        const pageInfo = {
          total: result.totalDocs,
          currentPage: result.page,
          perPage: result.limit,
          totalPages: result.pagingCounter,
        };
    
        return res.status(200).json({ message: "Data Fetched Successfully",staticData, pageInfo });
      } catch (error) {
        console.error(error);
        return res
          .status(500)
          .json({ message: "Internal Server Error", error: error.message });
      }
}

async function staticEdit(req, res) {
    try {
        const { _id, description } = req.body
        let staticUser = await staticModel.findOne({ _id: _id });
        if (!staticUser) {
            res.status(404).json({ message: "Content does not Exist" });
        } else {
            let user = await staticModel.findOneAndUpdate(
                { _id: staticUser._id },
                { $set: { description } },
                { new: true }
            );
            if (user) {
                res.status(200).json({ message: "StaticUser update the Content Successfully", user });
            }
        }
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
        console.error(error);
    }
}


async function staticCreate(req, res) {
    try {
        const { description, title, type } = req.body

        let static = new staticModel({
            type,
            title,
            description
        })
        const newStatic = await static.save()
        res.status(200).json({ message: "StaticUser update the Content Successfully", newStatic });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
        console.error(error);
    }
}
async function staticDelete(req, res) {
    try {
        const {_id} = req.body
        let staticUser = await staticModel.findOne({ _id: _id });
        if (!staticUser) {
            res.status(404).json({ message: "Content does not Exist" });
        } else {
            let cintent = await staticModel.findOneAndUpdate(
                { _id: staticUser._id },
                { $set: { status: "DELETED" } },
                { new: true }
            );
            if (cintent) {
                res.status(200).json({ message: "Stsatic Content Deleted Successfully", cintent });
            }
        }
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
        console.error(error);
    }
}
module.exports = { staticList, staticEdit, staticCreate, staticDelete };
