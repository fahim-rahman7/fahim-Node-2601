import SSLCommerzPayment from 'sslcommerz-lts';
import { Group } from '../models/group.model.js';
import { GroupMessage } from '../models/groupMessage.model.js';
import { User } from '../models/user.model.js';
import { redisClient } from '../config/redis.js';
import crypto from 'crypto';

const store_id = process.env.STORE_ID;
const store_passwd = process.env.STORE_PASSWORD;
const is_live = process.env.IS_LIVE === 'true'; // Sandbox er jonno false thakbe

// Helper URLs for Local & Production (Render + Vercel)
// BACKEND_URL না থাকলে req থেকে অটো লাইভ হোস্ট ধরে নেবে
const getBackendUrl = (req) => process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
const getFrontendUrl = () => process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';

// 1. Initiate Group Creation Payment
export const initGroupPayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupName, members } = req.body; // members = [friendId1, friendId2, ...]

    if (!groupName || !members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ success: false, message: 'Group name and members are required!' });
    }

    // Validate that all members are actually friends of the admin
    const adminUser = await User.findById(userId);
    const allAreFriends = members.every((memberId) =>
      adminUser.friends.some((friendId) => friendId.toString() === memberId.toString())
    );

    if (!allAreFriends) {
      return res.status(400).json({ success: false, message: 'All members must be in your friend list!' });
    }

    const tran_id = 'GRP_' + crypto.randomBytes(12).toString('hex');
    const amount = 100; // গ্রুপ খোলার ফি (যেমন: 100 টাকা)

    // Store pending group data in Redis for 30 minutes
    const groupData = {
      admin: userId.toString(),
      groupName,
      members: [...members, userId.toString()], // Admino member hisebe thakbe
    };
    await redisClient.set(`pending_group:${tran_id}`, JSON.stringify(groupData), 'EX', 1800);

    const BACKEND_URL = getBackendUrl(req);

    const data = {
      total_amount: amount,
      currency: 'BDT',
      tran_id: tran_id,
      success_url: `${BACKEND_URL}/api/v1/groups/payment/success/${tran_id}`,
      fail_url: `${BACKEND_URL}/api/v1/groups/payment/fail/${tran_id}`,
      cancel_url: `${BACKEND_URL}/api/v1/groups/payment/cancel`,
      ipn_url: `${BACKEND_URL}/api/v1/groups/payment/ipn`,
      shipping_method: 'N/A',
      product_name: 'Group Chat Creation',
      product_category: 'Service',
      product_profile: 'general',
      cus_name: adminUser.name,
      cus_email: adminUser.email,
      cus_add1: adminUser.address || 'Dhaka',
      cus_city: 'Dhaka',
      cus_postcode: '1212',
      cus_country: 'Bangladesh',
      cus_phone: adminUser.phone || '01700000000',
      ship_name: 'N/A',
      ship_add1: 'N/A',
      ship_city: 'N/A',
      ship_postcode: 'N/A',
      ship_country: 'N/A',
    };

    const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
    sslcz.init(data).then((apiResponse) => {
      let GatewayPageURL = apiResponse.GatewayPageURL;
      if (GatewayPageURL) {
        res.status(200).json({ success: true, gatewayUrl: GatewayPageURL });
      } else {
        res.status(400).json({ success: false, message: 'SSLCommerz initialization failed' });
      }
    });
  } catch (error) {
    console.error('Group Payment Init Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 2. Payment Success Handler
export const paymentSuccess = async (req, res) => {
  const FRONTEND_URL = getFrontendUrl();
  try {
    const { tran_id } = req.params;

    const cachedData = await redisClient.get(`pending_group:${tran_id}`);
    if (!cachedData) {
      return res.redirect(`${FRONTEND_URL}/chat?payment=expired`);
    }

    const { admin, groupName, members } = JSON.parse(cachedData);

    // Create Group in MongoDB
    await Group.create({
      name: groupName,
      admin,
      members,
    });

    // Clear redis cache
    await redisClient.del(`pending_group:${tran_id}`);

    // Frontend-এ success কুয়েরি দিয়ে রিডাইরেক্ট করা
    res.redirect(`${FRONTEND_URL}/chat?payment=success`);
  } catch (error) {
    console.error('Payment Success Error:', error.message);
    res.redirect(`${FRONTEND_URL}/chat?payment=error`);
  }
};

// 3. Payment Fail Handler
export const paymentFail = async (req, res) => {
  const FRONTEND_URL = getFrontendUrl();
  const { tran_id } = req.params;
  await redisClient.del(`pending_group:${tran_id}`);
  res.redirect(`${FRONTEND_URL}/chat?payment=failed`);
};

// 4. Payment Cancel Handler
export const paymentCancel = async (req, res) => {
  const FRONTEND_URL = getFrontendUrl();
  res.redirect(`${FRONTEND_URL}/chat?payment=cancelled`);
};

// 5. Get User's Groups List
export const getUserGroups = async (req, res) => {
  try {
    const userId = req.user._id;
    const groups = await Group.find({ members: userId }).populate('members', 'name profilePicture email');
    res.status(200).json({ success: true, data: groups });
  } catch (error) {
    console.error('Get Groups Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 6. Get Group Chat History
export const getGroupMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group || !group.members.includes(userId)) {
      return res.status(403).json({ success: false, message: 'Access denied! You are not a member of this group.' });
    }

    const messages = await GroupMessage.find({ group: groupId })
      .sort({ createdAt: 1 })
      .populate('sender', 'name profilePicture');

    res.status(200).json({ success: true, data: messages });
  } catch (error) {
    console.error('Get Group Messages Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 7. Add Multiple Members to Existing Group (Admin Only)
export const addMemberToGroup = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { groupId } = req.params;
    const { members } = req.body; // Array of friend IDs: ["id1", "id2", ...]

    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide an array of member IDs to add!' 
      });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found!' });
    }

    // 1. Check if requester is Admin
    if (group.admin.toString() !== currentUserId.toString()) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only the group admin can add new members!' 
      });
    }

    // 2. Ensure all member IDs belong to the admin's friend list
    const adminUser = await User.findById(currentUserId);
    const nonFriends = members.filter(
      (mId) => !adminUser.friends.some((fId) => fId.toString() === mId.toString())
    );

    if (nonFriends.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You can only add users who are in your friend list!',
      });
    }

    // 3. Filter out users who are already group members
    const newMembers = members.filter(
      (mId) => !group.members.some((existingId) => existingId.toString() === mId.toString())
    );

    if (newMembers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All selected users are already members of this group!',
      });
    }

    // 4. Add new unique members to the group ($addToSet prevents duplicates)
    await Group.findByIdAndUpdate(groupId, {
      $addToSet: { members: {$each: newMembers } },
    });

    const updatedGroup = await Group.findById(groupId).populate('members', 'name email profilePicture');

    res.status(200).json({
      success: true,
      message: `${newMembers.length} member(s) added to group successfully!`,
      data: updatedGroup,
    });
  } catch (error) {
    console.error('Add Group Members Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

// 8. Delete Group (Admin Only)
export const deleteGroup = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { groupId } = req.params;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found!' });
    }

    // Check if requester is Admin
    if (group.admin.toString() !== currentUserId.toString()) {
      return res.status(403).json({ success: false, message: 'Only the group admin can delete this group!' });
    }

    // Delete all messages belonging to this group
    await GroupMessage.deleteMany({ group: groupId });

    // Delete the group itself
    await Group.findByIdAndDelete(groupId);

    res.status(200).json({ success: true, message: 'Group deleted successfully!' });
  } catch (error) {
    console.error('Delete Group Error:', error.message);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};