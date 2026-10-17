// Get Logged-in User Profile
export const getUserProfile = async (req, res) => {
    try {
      // req.user contains the authenticated user details from protect middleware
      const user = req.user;
  
      res.status(200).json({
        success: true,
        message: 'Profile retrieved successfully!',
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
    } catch (error) {
      console.error('Get Profile Error:', error.message);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  };